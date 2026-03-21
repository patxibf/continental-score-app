import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { JWTPayload } from '../plugins/auth.js'

const AVATAR_OPTIONS = [
  'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
  'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
]

const createPlayerSchema = z.object({
  name: z.string().min(1).max(100),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
})

const updatePlayerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar').optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  active: z.boolean().optional(),
})

const playerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/players',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }

      const groupPlayers = await prisma.groupPlayer.findMany({
        where: { groupId },
        include: { player: true },
        orderBy: { player: { name: 'asc' } },
      })

      return reply.send(groupPlayers.map(gp => gp.player))
    },
  )

  fastify.post(
    '/api/players',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = createPlayerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const player = await prisma.player.create({
        data: {
          ...body.data,
          groupLinks: {
            create: { groupId },
          },
        },
      })

      return reply.status(201).send(player)
    },
  )

  fastify.patch(
    '/api/players/:id',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = updatePlayerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      // Verify player belongs to this group
      const link = await prisma.groupPlayer.findUnique({
        where: { groupId_playerId: { groupId, playerId: id } },
      })
      if (!link) {
        return reply.status(404).send({ error: 'Player not found' })
      }

      const player = await prisma.player.update({
        where: { id },
        data: body.data,
      })

      return reply.send(player)
    },
  )

  fastify.post(
    '/api/players/:id/link',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const player = await prisma.player.findUnique({ where: { id } })
      if (!player) {
        return reply.status(404).send({ error: 'Player not found' })
      }

      const existing = await prisma.groupPlayer.findUnique({
        where: { groupId_playerId: { groupId, playerId: id } },
      })
      if (existing) {
        return reply.status(409).send({ error: 'Player already linked to this group' })
      }

      await prisma.groupPlayer.create({ data: { groupId, playerId: id } })
      return reply.status(201).send(player)
    },
  )

  fastify.delete(
    '/api/players/:id/link',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      // Check if player has played any games in this group
      const hasGames = await prisma.gamePlayer.findFirst({
        where: {
          playerId: id,
          game: { season: { groupId } },
        },
      })
      if (hasGames) {
        return reply.status(400).send({ error: 'Cannot unlink player with game history in this group' })
      }

      const link = await prisma.groupPlayer.findUnique({
        where: { groupId_playerId: { groupId, playerId: id } },
      })
      if (!link) {
        return reply.status(404).send({ error: 'Player not linked to this group' })
      }

      await prisma.groupPlayer.delete({
        where: { groupId_playerId: { groupId, playerId: id } },
      })

      return reply.status(204).send()
    },
  )
}

export default playerRoutes
