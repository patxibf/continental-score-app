import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

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
