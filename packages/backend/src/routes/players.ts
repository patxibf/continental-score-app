import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { generateToken } from '../lib/tokens.js'
import { sendInvitationEmail } from '../lib/mailer.js'

const AVATAR_OPTIONS = [
  'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
  'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
]

const createPlayerSchema = z.object({
  name: z.string().min(1).max(100),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar'),
  email: z.string().email().optional(),
})

const updatePlayerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar').optional(),
  email: z.string().email().optional().nullable(),
  active: z.boolean().optional(),
})

const playerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/players — list active players in the current group
  fastify.get(
    '/api/players',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const players = await prisma.player.findMany({
        where: { groupId },
        orderBy: { name: 'asc' },
      })
      return reply.send(players)
    },
  )

  // POST /api/players — create player in group (admin only)
  fastify.post(
    '/api/players',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = createPlayerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const player = await prisma.player.create({
        data: { ...body.data, groupId, role: 'MEMBER' },
      })
      return reply.status(201).send(player)
    },
  )

  // POST /api/players/invite — invite player by email (admin only)
  fastify.post(
    '/api/players/invite',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const body = z.object({
        email: z.string().email(),
        name: z.string().min(2).max(50),
      }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

      const { email, name } = body.data
      const { groupId } = request.user as { groupId: string }

      // Check if a user with this email is already a member
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) {
        const existingPlayer = await prisma.player.findFirst({
          where: { groupId, userId: existingUser.id },
        })
        if (existingPlayer) return reply.status(400).send({ error: 'ALREADY_MEMBER' })
      }

      // Load group for the email
      const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } })
      if (!group) return reply.status(404).send({ error: 'Group not found' })

      const token = generateToken()
      const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      // Find existing pending invite for this email in this group, update or create
      const existing = await prisma.player.findFirst({
        where: { groupId, email, userId: null },
      })
      if (existing) {
        await prisma.player.update({
          where: { id: existing.id },
          data: { name, inviteToken: token, inviteExpiry },
        })
      } else {
        await prisma.player.create({
          data: { groupId, name, email, inviteToken: token, inviteExpiry, role: 'MEMBER' },
        })
      }

      // Send invitation email (best-effort)
      try {
        await sendInvitationEmail(email, name, group.name, token)
      } catch (err) {
        fastify.log.error({ err }, 'Failed to send invitation email')
      }

      return reply.status(201).send({ message: 'Invitation sent' })
    },
  )

  // GET /api/players/invitation/:token — public, look up invite details
  fastify.get(
    '/api/players/invitation/:token',
    async (request, reply) => {
      const { token } = request.params as { token: string }
      const player = await prisma.player.findFirst({
        where: { inviteToken: token, inviteExpiry: { gt: new Date() } },
        include: { group: { select: { name: true } } },
      })
      if (!player) return reply.status(404).send({ error: 'INVALID_TOKEN' })
      return reply.send({ playerName: player.name, groupName: player.group.name })
    },
  )

  // POST /api/players/invitation/claim — authenticated user claims an invite
  fastify.post(
    '/api/players/invitation/claim',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const body = z.object({ token: z.string() }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'token required' })

      const { token } = body.data
      const { userId } = request.user as { userId: string }

      const player = await prisma.player.findFirst({
        where: { inviteToken: token, inviteExpiry: { gt: new Date() }, userId: null },
      })
      if (!player) return reply.status(400).send({ error: 'INVALID_TOKEN' })

      // Check not already in that group
      const alreadyMember = await prisma.player.findFirst({
        where: { groupId: player.groupId, userId },
      })
      if (alreadyMember) return reply.status(400).send({ error: 'ALREADY_MEMBER' })

      // Link user to player
      await prisma.$transaction([
        prisma.player.update({
          where: { id: player.id },
          data: { userId, inviteToken: null, inviteExpiry: null },
        }),
      ])

      // Re-issue JWT — check how many groups this user is now in
      const allPlayers = await prisma.player.findMany({
        where: { userId, active: true },
        include: { group: { select: { id: true, name: true, slug: true, currency: true } } },
      })

      if (allPlayers.length > 1) {
        return reply.send({
          requiresGroupSelection: true,
          groups: allPlayers.map((p: any) => ({
            groupId: p.groupId,
            groupName: p.group.name,
            groupSlug: p.group.slug,
            groupRole: p.role.toLowerCase(),
          })),
        })
      }

      // Single group — issue JWT for the claimed group
      const claimedPlayer = allPlayers.find((p: any) => p.groupId === player.groupId)!
      const jwtPayload = {
        role: 'user' as const,
        userId,
        playerId: claimedPlayer.id,
        groupId: claimedPlayer.groupId,
        groupRole: claimedPlayer.role.toLowerCase() as 'owner' | 'admin' | 'member',
      }
      const jwtToken = fastify.jwt.sign(jwtPayload, { expiresIn: '7d' })
      reply.setCookie('token', jwtToken, { httpOnly: true, path: '/', maxAge: 7 * 24 * 60 * 60 })

      return reply.send({ message: 'Invitation claimed' })
    },
  )

  // PATCH /api/players/:id
  fastify.patch(
    '/api/players/:id',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = updatePlayerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const player = await prisma.player.findFirst({ where: { id, groupId } })
      if (!player) return reply.status(404).send({ error: 'Player not found' })

      const updated = await prisma.player.update({ where: { id }, data: body.data })
      return reply.send(updated)
    },
  )

  // PATCH /api/players/:id/role — change player role (admin/owner only)
  fastify.patch(
    '/api/players/:id/role',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = z.object({
        role: z.enum(['ADMIN', 'MEMBER']),
      }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

      const player = await prisma.player.findFirst({
        where: { id, groupId },
      })
      if (!player) return reply.status(404).send({ error: 'Player not found' })
      if (player.role === 'OWNER') return reply.status(403).send({ error: 'CANNOT_CHANGE_OWNER' })

      const updated = await prisma.player.update({
        where: { id },
        data: { role: body.data.role },
      })
      return reply.send(updated)
    },
  )
}

export default playerRoutes
