import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { JWTPayload } from '../plugins/auth.js'

const updateGroupSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  currency: z.enum(['GBP', 'EUR', 'USD']).optional(),
})

const groupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/groups/current',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: {
          id: true, name: true, slug: true, currency: true, createdAt: true,
          _count: { select: { players: true } },
        },
      })
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      return reply.send(group)
    },
  )

  fastify.patch(
    '/api/groups/current',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = updateGroupSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

      const group = await prisma.group.findUnique({ where: { id: groupId } })
      if (!group) return reply.status(404).send({ error: 'Group not found' })

      const updated = await prisma.group.update({
        where: { id: groupId },
        data: body.data,
      })
      return reply.send(updated)
    },
  )
}

export default groupRoutes
