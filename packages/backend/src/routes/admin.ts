import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  username: z.string().min(3).max(50).regex(/^[a-z0-9_-]+$/),
  password: z.string().min(6),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(6).optional(),
})

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (_request, reply) => {
      const groups = await prisma.group.findMany({
        select: { id: true, name: true, username: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(groups)
    },
  )

  fastify.post(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const body = createGroupSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const { name, username, password } = body.data

      const existing = await prisma.group.findUnique({ where: { username } })
      if (existing) {
        return reply.status(409).send({ error: 'Username already taken' })
      }

      const passwordHash = await bcrypt.hash(password, 10)
      const group = await prisma.group.create({
        data: { name, username, passwordHash },
        select: { id: true, name: true, username: true, createdAt: true },
      })

      return reply.status(201).send(group)
    },
  )

  fastify.patch(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = updateGroupSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' })
      }

      const data: { name?: string; passwordHash?: string } = {}
      if (body.data.name) data.name = body.data.name
      if (body.data.password) data.passwordHash = await bcrypt.hash(body.data.password, 10)

      const updated = await prisma.group.update({
        where: { id },
        data,
        select: { id: true, name: true, username: true, createdAt: true },
      })

      return reply.send(updated)
    },
  )

  fastify.delete(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' })
      }

      await prisma.group.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}

export default adminRoutes
