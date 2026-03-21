import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid request' })
    }

    const { username, password } = body.data

    // Try system admin
    const admin = await prisma.admin.findUnique({ where: { username } })
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      const token = fastify.jwt.sign({ role: 'admin', adminId: admin.id })
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      })
      return reply.send({ role: 'admin', username: admin.username })
    }

    // Try group — check admin password first, then member password
    const group = await prisma.group.findUnique({ where: { username } })
    if (group) {
      let groupAccess: 'admin' | 'member' | null = null

      if (await bcrypt.compare(password, group.passwordHash)) {
        groupAccess = 'admin'
      } else if (
        group.memberPasswordHash &&
        (await bcrypt.compare(password, group.memberPasswordHash))
      ) {
        groupAccess = 'member'
      }

      if (groupAccess) {
        const token = fastify.jwt.sign({ role: 'group', groupId: group.id, groupAccess })
        reply.setCookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/',
        })
        return reply.send({ role: 'group', groupId: group.id, groupName: group.name, groupAccess })
      }
    }

    return reply.status(401).send({ error: 'Invalid credentials' })
  })

  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })

  fastify.get('/api/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as { role: string; groupId?: string; adminId?: string; groupAccess?: string }
    if (payload.role === 'admin') {
      const admin = await prisma.admin.findUnique({
        where: { id: payload.adminId },
        select: { id: true, username: true },
      })
      return reply.send({ role: 'admin', ...admin })
    }
    if (payload.role === 'group') {
      const group = await prisma.group.findUnique({
        where: { id: payload.groupId },
        select: { id: true, name: true, username: true },
      })
      return reply.send({
        role: 'group',
        groupId: payload.groupId,
        groupAccess: payload.groupAccess ?? 'admin',
        ...group,
      })
    }
    return reply.status(401).send({ error: 'Unauthorized' })
  })
}

export default authRoutes
