import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { TOTAL_ROUNDS, getRoundInfo } from '../lib/gameRules.js'

const scoreSchema = z.object({
  playerId: z.string(),
  points: z.number().int(),
  wentOut: z.boolean().default(false),
  wentOutInOneGo: z.boolean().default(false),
})

const submitRoundSchema = z.object({
  roundNumber: z.number().int().min(1).max(TOTAL_ROUNDS),
  scores: z.array(scoreSchema).min(2),
})

const roundRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/games/:gameId/rounds',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string; groupAccess: string }
      const { gameId } = request.params as { gameId: string }

      const game = await prisma.game.findFirst({
        where: { id: gameId, season: { groupId } },
      })
      if (!game) {
        return reply.status(404).send({ error: 'Game not found' })
      }

      const rounds = await prisma.round.findMany({
        where: { gameId },
        include: {
          scores: {
            include: { player: { select: { id: true, name: true, avatar: true } } },
          },
        },
        orderBy: { roundNumber: 'asc' },
      })

      return reply.send(rounds)
    },
  )

  fastify.post(
    '/api/games/:gameId/rounds',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string; groupAccess: string }
      const { gameId } = request.params as { gameId: string }
      const body = submitRoundSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const game = await prisma.game.findFirst({
        where: { id: gameId, season: { groupId } },
        include: { players: true, rounds: true },
      })
      if (!game) {
        return reply.status(404).send({ error: 'Game not found' })
      }
      if (game.status === 'CLOSED') {
        return reply.status(403).send({ error: 'Cannot add rounds to a closed game' })
      }

      const { roundNumber, scores } = body.data

      // Check round isn't already submitted
      const existingRound = game.rounds.find(r => r.roundNumber === roundNumber)
      if (existingRound) {
        return reply.status(409).send({ error: `Round ${roundNumber} already submitted` })
      }

      // Validate all game players have scores
      const gamePlayerIds = new Set(game.players.map(gp => gp.playerId))
      const scorePlayerIds = new Set(scores.map(s => s.playerId))
      for (const pid of gamePlayerIds) {
        if (!scorePlayerIds.has(pid)) {
          return reply.status(400).send({ error: `Missing score for player ${pid}` })
        }
      }

      // Only one player can have wentOut=true
      const wentOutCount = scores.filter(s => s.wentOut).length
      if (wentOutCount > 1) {
        return reply.status(400).send({ error: 'Only one player can go out per round' })
      }

      const round = await prisma.round.create({
        data: {
          gameId,
          roundNumber,
          completedAt: new Date(),
          scores: {
            create: scores.map(s => ({
              playerId: s.playerId,
              points: s.wentOut
                ? (s.wentOutInOneGo ? -(roundNumber * 10) : 0)
                : s.points,
              wentOut: s.wentOut,
            })),
          },
        },
        include: {
          scores: { include: { player: { select: { id: true, name: true, avatar: true } } } },
        },
      })

      return reply.status(201).send(round)
    },
  )

  fastify.patch(
    '/api/rounds/:id',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string; groupAccess: string }
      const { id } = request.params as { id: string }
      const body = z.object({
        scores: z.array(scoreSchema).min(2),
      }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const round = await prisma.round.findFirst({
        where: { id },
        include: { game: { include: { season: true } } },
      })
      if (!round || round.game.season.groupId !== groupId) {
        return reply.status(404).send({ error: 'Round not found' })
      }
      if (round.game.status === 'CLOSED') {
        return reply.status(403).send({ error: 'Cannot edit rounds in a closed game' })
      }

      const wentOutCount = body.data.scores.filter(s => s.wentOut).length
      if (wentOutCount > 1) {
        return reply.status(400).send({ error: 'Only one player can go out per round' })
      }

      // Delete old scores and re-create
      await prisma.roundScore.deleteMany({ where: { roundId: id } })
      const updatedRound = await prisma.round.update({
        where: { id },
        data: {
          completedAt: new Date(),
          scores: {
            create: body.data.scores.map(s => ({
              playerId: s.playerId,
              points: s.wentOut
                ? (s.wentOutInOneGo ? -(round.roundNumber * 10) : 0)
                : s.points,
              wentOut: s.wentOut,
            })),
          },
        },
        include: {
          scores: { include: { player: { select: { id: true, name: true, avatar: true } } } },
        },
      })

      return reply.send(updatedRound)
    },
  )

  fastify.delete(
    '/api/rounds/:id',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string; groupAccess: string }
      const { id } = request.params as { id: string }

      const round = await prisma.round.findFirst({
        where: { id, game: { season: { groupId } } },
        include: {
          game: {
            include: {
              rounds: { orderBy: { roundNumber: 'desc' }, take: 1 },
            },
          },
        },
      })

      if (!round) return reply.status(404).send({ error: 'Round not found' })
      if (round.game.status === 'CLOSED') return reply.status(403).send({ error: 'Game is closed' })
      if (round.game.rounds[0].id !== id) {
        return reply.status(400).send({ error: 'Can only undo the last round' })
      }

      await prisma.round.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}

export default roundRoutes
