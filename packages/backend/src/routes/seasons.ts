import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const createSeasonSchema = z.object({
  name: z.string().min(1).max(100),
  potEnabled: z.boolean().default(false),
  contributionAmount: z.number().optional(),
})

const updateSeasonSchema = z.object({
  name: z.string().min(1).max(100),
})

const seasonRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/seasons',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }

      const seasons = await prisma.season.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { games: true, players: true } },
        },
      })

      return reply.send(seasons)
    },
  )

  fastify.post(
    '/api/seasons',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = createSeasonSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      // Pot validation
      if (body.data.potEnabled) {
        const amt = body.data.contributionAmount
        if (amt == null || amt <= 0) {
          return reply.status(400).send({ error: 'contributionAmount is required and must be > 0 when potEnabled' })
        }
        if (amt > 9999.99) {
          return reply.status(400).send({ error: 'contributionAmount must not exceed 9999.99' })
        }
        if (Number(amt.toFixed(2)) !== amt) {
          return reply.status(400).send({ error: 'contributionAmount must have at most 2 decimal places' })
        }
      }

      const season = await prisma.season.create({
        data: {
          name: body.data.name,
          groupId,
          potEnabled: body.data.potEnabled,
          ...(body.data.potEnabled && body.data.contributionAmount != null
            ? { contributionAmount: body.data.contributionAmount }
            : {}),
        },
      })

      return reply.status(201).send(season)
    },
  )

  fastify.patch(
    '/api/seasons/:id',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = updateSeasonSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const season = await prisma.season.findFirst({ where: { id, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }

      const updated = await prisma.season.update({
        where: { id },
        data: { name: body.data.name },
      })

      return reply.send(updated)
    },
  )

  fastify.post(
    '/api/seasons/:id/close',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const season = await prisma.season.findFirst({ where: { id, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }
      if (season.status === 'CLOSED') {
        return reply.status(400).send({ error: 'Season already closed' })
      }

      // Close all in-progress games first
      await prisma.game.updateMany({
        where: { seasonId: id, status: 'IN_PROGRESS' },
        data: { status: 'CLOSED', closedAt: new Date() },
      })

      const updated = await prisma.season.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() },
      })

      return reply.send(updated)
    },
  )

  fastify.get(
    '/api/seasons/:id/players',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const season = await prisma.season.findFirst({ where: { id, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }

      const seasonPlayers = await prisma.seasonPlayer.findMany({
        where: { seasonId: id },
        include: { player: true },
        orderBy: { player: { name: 'asc' } },
      })

      return reply.send(seasonPlayers.map(sp => sp.player))
    },
  )

  fastify.post(
    '/api/seasons/:id/players',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = z.object({ playerId: z.string() }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request' })
      }

      const season = await prisma.season.findFirst({ where: { id, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }

      // Verify player belongs to this group
      const playerLink = await prisma.groupPlayer.findUnique({
        where: { groupId_playerId: { groupId, playerId: body.data.playerId } },
      })
      if (!playerLink) {
        return reply.status(404).send({ error: 'Player not found in group' })
      }

      const existing = await prisma.seasonPlayer.findUnique({
        where: { seasonId_playerId: { seasonId: id, playerId: body.data.playerId } },
      })
      if (existing) {
        return reply.status(409).send({ error: 'Player already in season' })
      }

      await prisma.seasonPlayer.create({
        data: { seasonId: id, playerId: body.data.playerId },
      })

      return reply.status(201).send({ ok: true })
    },
  )

  fastify.delete(
    '/api/seasons/:id/players/:playerId',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id, playerId } = request.params as { id: string; playerId: string }

      const season = await prisma.season.findFirst({ where: { id, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }

      // Check if player has games in this season
      const hasGames = await prisma.gamePlayer.findFirst({
        where: { playerId, game: { seasonId: id } },
      })
      if (hasGames) {
        return reply.status(400).send({ error: 'Cannot remove player with games in this season' })
      }

      const seasonPlayer = await prisma.seasonPlayer.findUnique({
        where: { seasonId_playerId: { seasonId: id, playerId } },
      })
      if (!seasonPlayer) {
        return reply.status(404).send({ error: 'Player not in season' })
      }

      await prisma.seasonPlayer.delete({
        where: { seasonId_playerId: { seasonId: id, playerId } },
      })

      return reply.status(204).send()
    },
  )

  // Season standings
  fastify.get(
    '/api/seasons/:id/standings',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const season = await prisma.season.findFirst({ where: { id, groupId } })
      if (!season) {
        return reply.status(404).send({ error: 'Season not found' })
      }

      // Get all closed games and their scores
      const games = await prisma.game.findMany({
        where: { seasonId: id, status: 'CLOSED' },
        include: {
          players: { include: { player: true } },
          rounds: {
            include: { scores: true },
          },
        },
      })

      // Aggregate per player
      const playerStats: Record<string, {
        playerId: string
        playerName: string
        playerAvatar: string
        totalPoints: number
        gamesPlayed: number
        wins: number
      }> = {}

      for (const game of games) {
        const gameTotals: Record<string, number> = {}

        for (const gp of game.players) {
          gameTotals[gp.playerId] = 0
          if (!playerStats[gp.playerId]) {
            playerStats[gp.playerId] = {
              playerId: gp.playerId,
              playerName: gp.player.name,
              playerAvatar: gp.player.avatar,
              totalPoints: 0,
              gamesPlayed: 0,
              wins: 0,
            }
          }
          playerStats[gp.playerId].gamesPlayed++
        }

        for (const round of game.rounds) {
          for (const score of round.scores) {
            gameTotals[score.playerId] = (gameTotals[score.playerId] || 0) + score.points
          }
        }

        // Find game winner (lowest score)
        const gamePlayerIds = Object.keys(gameTotals)
        if (gamePlayerIds.length > 0) {
          const minScore = Math.min(...gamePlayerIds.map(pid => gameTotals[pid]))
          for (const pid of gamePlayerIds) {
            playerStats[pid].totalPoints += gameTotals[pid]
            if (gameTotals[pid] === minScore) {
              playerStats[pid].wins++
            }
          }
        }
      }

      const standings = Object.values(playerStats).sort(
        (a, b) => a.totalPoints - b.totalPoints,
      )

      return reply.send(standings)
    },
  )
}

export default seasonRoutes
