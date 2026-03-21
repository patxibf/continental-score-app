import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { TOTAL_ROUNDS } from '../lib/gameRules.js'

const createGameSchema = z.object({
  playerIds: z.array(z.string()).min(2).max(8),
})

const gameRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/seasons/:seasonId/games',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { seasonId } = request.params as { seasonId: string }

      const season = await prisma.season.findFirst({ where: { id: seasonId, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }

      const games = await prisma.game.findMany({
        where: { seasonId },
        orderBy: { createdAt: 'desc' },
        include: {
          players: { include: { player: { select: { id: true, name: true, avatar: true } } } },
          _count: { select: { rounds: true } },
        },
      })

      return reply.send(games)
    },
  )

  fastify.post(
    '/api/seasons/:seasonId/games',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { seasonId } = request.params as { seasonId: string }
      const body = createGameSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const season = await prisma.season.findFirst({ where: { id: seasonId, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }
      if (season.status === 'CLOSED') {
        return reply.status(400).send({ error: 'Cannot create game in a closed season' })
      }

      // Verify all players belong to this group
      const playerLinks = await prisma.groupPlayer.findMany({
        where: { groupId, playerId: { in: body.data.playerIds } },
      })
      if (playerLinks.length !== body.data.playerIds.length) {
        return reply.status(400).send({ error: 'One or more players not found in group' })
      }

      const game = await prisma.game.create({
        data: {
          seasonId,
          players: {
            create: body.data.playerIds.map(playerId => ({ playerId })),
          },
        },
        include: {
          players: { include: { player: true } },
        },
      })

      // Also add players to season if not already there
      for (const playerId of body.data.playerIds) {
        await prisma.seasonPlayer.upsert({
          where: { seasonId_playerId: { seasonId, playerId } },
          create: { seasonId, playerId },
          update: {},
        })
      }

      return reply.status(201).send(game)
    },
  )

  fastify.get(
    '/api/games/:id',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const game = await prisma.game.findFirst({
        where: { id, season: { groupId } },
        include: {
          season: { select: { id: true, name: true, groupId: true } },
          players: { include: { player: true } },
          rounds: {
            include: { scores: { include: { player: { select: { id: true, name: true, avatar: true } } } } },
            orderBy: { roundNumber: 'asc' },
          },
        },
      })

      if (!game) {
        return reply.status(404).send({ error: 'Game not found' })
      }

      // Compute live totals
      const totals: Record<string, number> = {}
      for (const gp of game.players) {
        totals[gp.playerId] = 0
      }
      for (const round of game.rounds) {
        for (const score of round.scores) {
          totals[score.playerId] = (totals[score.playerId] || 0) + score.points
        }
      }

      return reply.send({ ...game, totals })
    },
  )

  fastify.post(
    '/api/games/:id/close',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = z.object({ confirm: z.literal(true) }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Must confirm closing the game' })
      }

      const game = await prisma.game.findFirst({
        where: { id, season: { groupId } },
        include: {
          rounds: { include: { scores: true } },
          players: { include: { player: true } },
        },
      })

      if (!game) {
        return reply.status(404).send({ error: 'Game not found' })
      }
      if (game.status === 'CLOSED') {
        return reply.status(400).send({ error: 'Game already closed' })
      }
      if (game.rounds.length < TOTAL_ROUNDS) {
        return reply.status(400).send({
          error: `Cannot close game: all ${TOTAL_ROUNDS} rounds must be completed first`,
        })
      }

      const updated = await prisma.game.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() },
      })

      return reply.send(updated)
    },
  )
  fastify.delete(
    '/api/games/:id',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const game = await prisma.game.findFirst({
        where: { id, season: { groupId } },
      })

      if (!game) {
        return reply.status(404).send({ error: 'Game not found' })
      }
      if (game.status === 'CLOSED') {
        return reply.status(403).send({ error: 'Cannot abort a closed game' })
      }

      await prisma.game.delete({ where: { id } })

      return reply.status(204).send()
    },
  )
}

export default gameRoutes
