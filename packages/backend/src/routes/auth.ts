import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { uniqueSlug } from '../lib/slug.js'
import { createAuthToken, consumeToken } from '../lib/tokens.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/mailer.js'
import { JWTPayload } from '../plugins/auth.js'

const AVATAR_OPTIONS = [
  'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
  'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
]

const registerSchema = z.object({
  groupName: z.string().min(2).max(50),
  playerName: z.string().min(2).max(50),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar'),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  groupId: z.string().optional(),
})

function setJwtCookie(fastify: any, reply: any, payload: JWTPayload) {
  const token = fastify.jwt.sign(payload)
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
    }
    const { groupName, playerName, avatar, email, password } = body.data

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return reply.status(400).send({ error: 'EMAIL_TAKEN' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const slug = await uniqueSlug(groupName)

    let user: any, group: any, player: any
    await prisma.$transaction(async (tx) => {
      user = await tx.user.create({
        data: { email, passwordHash, emailVerified: false },
      })
      group = await tx.group.create({
        data: { name: groupName, slug, currency: 'EUR' },
      })
      player = await tx.player.create({
        data: { name: playerName, avatar, groupId: group.id, userId: user.id, role: 'OWNER' },
      })
    })

    // Create verification token and send email outside transaction (best-effort)
    try {
      const verifyToken = await createAuthToken(user.id, 'EMAIL_VERIFICATION', 24)
      await sendVerificationEmail(email, playerName, verifyToken)
    } catch (e) {
      console.error('Failed to send verification email', e)
    }

    setJwtCookie(fastify, reply, {
      role: 'user',
      userId: user.id,
      playerId: player.id,
      groupId: group.id,
      groupRole: 'owner',
    })

    return reply.status(201).send({
      role: 'user',
      userId: user.id,
      email: user.email,
      emailVerified: false,
      playerId: player.id,
      playerName: player.name,
      playerAvatar: player.avatar,
      groupId: group.id,
      groupName: group.name,
      groupSlug: group.slug,
      groupRole: 'owner',
      currency: group.currency,
    })
  })

  // POST /api/auth/verify-email
  fastify.post('/api/auth/verify-email', async (request, reply) => {
    const body = z.object({ token: z.string() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

    const result = await consumeToken(body.data.token, 'EMAIL_VERIFICATION')
    if (!result) return reply.status(400).send({ error: 'INVALID_TOKEN' })

    await prisma.user.update({ where: { id: result.userId }, data: { emailVerified: true } })
    return reply.send({ message: 'Email verified' })
  })

  // POST /api/auth/resend-verification
  fastify.post('/api/auth/resend-verification', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const payload = request.user as JWTPayload
    if (payload.role !== 'user') return reply.status(403).send({ error: 'Forbidden' })

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (user.emailVerified) return reply.status(400).send({ error: 'Email already verified' })

    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION', usedAt: null },
      data: { usedAt: new Date() },
    })

    const token = await createAuthToken(user.id, 'EMAIL_VERIFICATION', 24)
    const player = await prisma.player.findFirst({ where: { userId: user.id } })
    await sendVerificationEmail(user.email, player?.name ?? 'there', token)
    return reply.send({ ok: true })
  })

  // POST /api/auth/forgot-password
  fastify.post('/api/auth/forgot-password', async (request, reply) => {
    const body = z.object({ email: z.string().email() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) return reply.send({ ok: true }) // silent

    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    })
    const token = await createAuthToken(user.id, 'PASSWORD_RESET', 1)
    const player = await prisma.player.findFirst({ where: { userId: user.id } })
    try {
      await sendPasswordResetEmail(user.email, player?.name ?? 'there', token)
    } catch (e) {
      console.error('Failed to send reset email', e)
    }
    return reply.send({ ok: true })
  })

  // POST /api/auth/reset-password
  fastify.post('/api/auth/reset-password', async (request, reply) => {
    const body = z.object({ token: z.string(), password: z.string().min(8) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })

    const result = await consumeToken(body.data.token, 'PASSWORD_RESET')
    if (!result) return reply.status(400).send({ error: 'INVALID_TOKEN' })

    const passwordHash = await bcrypt.hash(body.data.password, 12)
    await prisma.user.update({ where: { id: result.userId }, data: { passwordHash } })
    return reply.send({ ok: true })
  })

  // POST /api/auth/login
  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })
    const { email, password, groupId: requestedGroupId } = body.data

    // Try admin (email field used as username)
    const admin = await prisma.admin.findUnique({ where: { username: email } })
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      setJwtCookie(fastify, reply, { role: 'admin', adminId: admin.id })
      return reply.send({ role: 'admin', adminId: admin.id, username: admin.username })
    }

    // Try user
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const players = await prisma.player.findMany({
      where: { userId: user.id },
      include: { group: true },
    })

    if (players.length === 0) {
      return reply.status(403).send({ error: 'NO_GROUP' })
    }

    // Single group — issue JWT immediately
    if (players.length === 1) {
      const p = players[0]
      const groupRole = p.role.toLowerCase() as 'owner' | 'admin' | 'member'
      setJwtCookie(fastify, reply, { role: 'user', userId: user.id, playerId: p.id, groupId: p.groupId, groupRole })
      return reply.send(meResponse(user, p))
    }

    // Multiple groups
    if (requestedGroupId) {
      const p = players.find(pl => pl.groupId === requestedGroupId)
      if (!p) return reply.status(403).send({ error: 'Forbidden' })
      const groupRole = p.role.toLowerCase() as 'owner' | 'admin' | 'member'
      setJwtCookie(fastify, reply, { role: 'user', userId: user.id, playerId: p.id, groupId: p.groupId, groupRole })
      return reply.send(meResponse(user, p))
    }

    return reply.send({
      requiresGroupSelection: true,
      groups: players.map(p => ({
        groupId: p.groupId,
        groupName: p.group.name,
        groupSlug: p.group.slug,
        groupRole: p.role.toLowerCase(),
      })),
    })
  })

  // POST /api/auth/switch-group
  fastify.post('/api/auth/switch-group', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const payload = request.user as JWTPayload
    if (payload.role !== 'user') return reply.status(403).send({ error: 'Forbidden' })

    const body = z.object({ groupId: z.string() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

    const player = await prisma.player.findFirst({
      where: { userId: payload.userId, groupId: body.data.groupId },
      include: { group: true },
    })
    if (!player) return reply.status(403).send({ error: 'Forbidden' })

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const groupRole = player.role.toLowerCase() as 'owner' | 'admin' | 'member'
    setJwtCookie(fastify, reply, { role: 'user', userId: user.id, playerId: player.id, groupId: player.groupId, groupRole })
    return reply.send(meResponse(user, player))
  })

  // GET /api/auth/me
  fastify.get('/api/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as JWTPayload
    if (payload.role === 'admin') {
      const admin = await prisma.admin.findUnique({
        where: { id: payload.adminId },
        select: { id: true, username: true },
      })
      return reply.send({ role: 'admin', adminId: admin?.id, username: admin?.username })
    }

    if (payload.role === 'user') {
      const user = await prisma.user.findUnique({ where: { id: payload.userId } })
      if (!user) return reply.status(401).send({ error: 'Unauthorized' })

      const player = await prisma.player.findFirst({
        where: { id: payload.playerId, userId: payload.userId },
        include: { group: true },
      })
      if (!player) return reply.status(401).send({ error: 'Unauthorized' })

      return reply.send(meResponse(user, player))
    }

    return reply.status(401).send({ error: 'Unauthorized' })
  })

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })
}

function meResponse(user: any, player: any) {
  return {
    role: 'user' as const,
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    playerId: player.id,
    playerName: player.name,
    playerAvatar: player.avatar,
    groupId: player.groupId,
    groupName: player.group.name,
    groupSlug: player.group.slug,
    groupRole: player.role.toLowerCase(),
    currency: player.group.currency,
  }
}

export default authRoutes
