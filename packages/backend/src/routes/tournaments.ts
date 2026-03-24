import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { computeBracket } from '../lib/tournamentAlgorithm.js'

const stageConfigSchema = z.object({
  startRound: z.number().int().min(1).max(7),
  endRound: z.number().int().min(1).max(7),
}).refine(d => d.endRound >= d.startRound, { message: 'endRound must be >= startRound' })

const createTournamentSchema = z.object({
  name: z.string().min(1).max(100),
  playerIds: z.array(z.string()).min(3),
  stageConfigs: z.array(stageConfigSchema).min(1),
})

const tournamentRoutes: FastifyPluginAsync = async (fastify) => {
  // IMPORTANT: register /preview before /:id to avoid route shadowing
  fastify.get(
    '/api/tournaments/preview',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const query = z.object({ playerCount: z.coerce.number().int().min(3).max(200) })
        .safeParse(request.query)
      if (!query.success) {
        return reply.status(400).send({ error: 'playerCount must be an integer >= 3' })
      }

      try {
        const stages = computeBracket(query.data.playerCount)
        return reply.send({ stages })
      } catch (err: any) {
        return reply.status(400).send({ error: err.message })
      }
    },
  )

  fastify.post(
    '/api/tournaments',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = createTournamentSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const { name, playerIds, stageConfigs } = body.data

      // Verify all players belong to this group
      const players = await prisma.player.findMany({
        where: { groupId, id: { in: playerIds }, active: true, userId: { not: null } },
      })
      if (players.length !== playerIds.length) {
        return reply.status(400).send({ error: 'One or more players not found in group' })
      }

      // Compute bracket and validate stageConfigs length
      const bracket = computeBracket(playerIds.length)
      if (stageConfigs.length !== bracket.length) {
        return reply.status(400).send({
          error: `stageConfigs length must match bracket stage count (expected ${bracket.length}, got ${stageConfigs.length})`,
        })
      }

      // Build tournament + stage 1 tables in a transaction
      const tournament = await prisma.$transaction(async (tx) => {
        // Create tournament
        const t = await tx.tournament.create({
          data: {
            groupId,
            name,
            status: 'IN_PROGRESS',
            participants: {
              create: playerIds.map(playerId => ({ playerId })),
            },
          },
        })

        // Create all stages (tables created only for stage 1)
        const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5)

        for (let i = 0; i < bracket.length; i++) {
          const desc = bracket[i]
          const config = stageConfigs[i]
          const isFirstStage = i === 0

          const stage = await tx.tournamentStage.create({
            data: {
              tournamentId: t.id,
              stageNumber: desc.stageNumber,
              startRound: config.startRound,
              endRound: config.endRound,
              advancePerTable: desc.advancePerTable,
              status: isFirstStage ? 'IN_PROGRESS' : 'PENDING',
            },
          })

          if (isFirstStage) {
            // Pad with byes if needed
            const totalSlots = desc.tableCount * desc.playersPerTable
            const paddedPlayers: (string | null)[] = [
              ...shuffledPlayers.slice(0, playerIds.length),
              ...Array(totalSlots - playerIds.length).fill(null), // bye slots
            ]

            for (let tableIndex = 0; tableIndex < desc.tableCount; tableIndex++) {
              const tablePlayers = paddedPlayers.slice(
                tableIndex * desc.playersPerTable,
                (tableIndex + 1) * desc.playersPerTable,
              )

              await tx.tournamentTable.create({
                data: {
                  stageId: stage.id,
                  tableNumber: tableIndex + 1,
                  status: 'PENDING',
                  players: {
                    create: tablePlayers.map(pid => ({
                      playerId: pid,
                      isBye: pid === null,
                    })),
                  },
                },
              })
            }
          }
        }

        return tx.tournament.findFirst({
          where: { id: t.id },
          include: {
            participants: true,
            stages: {
              include: { tables: { include: { players: { include: { player: true } } } } },
              orderBy: { stageNumber: 'asc' },
            },
          },
        })
      })

      return reply.status(201).send(tournament)
    },
  )

  // GET /api/tournaments and GET /api/tournaments/:id added in Task 5
}

export default tournamentRoutes
