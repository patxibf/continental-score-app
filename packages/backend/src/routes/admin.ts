import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/groups — list all groups with member count
  fastify.get(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (_request, reply) => {
      const groups = await prisma.group.findMany({
        select: {
          id: true, name: true, slug: true, createdAt: true, currency: true,
          _count: { select: { players: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(groups)
    },
  )

  // GET /api/admin/groups/:id
  fastify.get(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const group = await prisma.group.findUnique({
        where: { id },
        select: {
          id: true, name: true, slug: true, createdAt: true, currency: true,
          _count: { select: { players: true } },
        },
      })
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      return reply.send(group)
    },
  )

  // DELETE /api/admin/groups/:id
  fastify.delete(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      await prisma.group.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}

export default adminRoutes
