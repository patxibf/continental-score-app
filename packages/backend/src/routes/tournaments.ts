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
        return reply.status(400).send({ error: 'One or more playerIds not found in this group, or duplicates were provided' })
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
        const createdTournament = await tx.tournament.create({
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
              tournamentId: createdTournament.id,
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
              ...shuffledPlayers,
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
          where: { id: createdTournament.id },
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

  fastify.get(
    '/api/tournaments',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }

      const tournaments = await prisma.tournament.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
        include: { participants: { select: { id: true } } },
      })

      return reply.send(tournaments)
    },
  )

  fastify.get(
    '/api/tournaments/:id',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const tournament = await prisma.tournament.findFirst({
        where: { id, groupId },
        include: {
          participants: { include: { player: { select: { id: true, name: true, avatar: true } } } },
          stages: {
            orderBy: { stageNumber: 'asc' },
            include: {
              tables: {
                orderBy: { tableNumber: 'asc' },
                include: {
                  players: {
                    include: { player: { select: { id: true, name: true, avatar: true } } },
                  },
                  game: {
                    include: {
                      rounds: {
                        include: { scores: true },
                        orderBy: { roundNumber: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })

      if (!tournament) {
        return reply.status(404).send({ error: 'Tournament not found' })
      }

      // Attach per-player score totals to each table player
      const stagesWithTotals = tournament.stages.map(stage => ({
        ...stage,
        tables: stage.tables.map(table => {
          const totals: Record<string, number> = {}
          if (table.game) {
            for (const round of table.game.rounds) {
              for (const score of round.scores) {
                totals[score.playerId] = (totals[score.playerId] ?? 0) + score.points
              }
            }
          }
          return {
            ...table,
            players: table.players.map(tp => ({
              ...tp,
              score: tp.playerId ? (totals[tp.playerId] ?? null) : null,
            })),
          }
        }),
      }))

      return reply.send({ ...tournament, stages: stagesWithTotals })
    },
  )

  fastify.post(
    '/api/tournaments/:id/stages/:stageId/advance',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id, stageId } = request.params as { id: string; stageId: string }

      const stage = await prisma.tournamentStage.findFirst({
        where: { id: stageId, tournament: { id, groupId } },
        include: {
          tables: {
            include: {
              players: true,
              game: { include: { rounds: { include: { scores: true } } } },
            },
          },
          tournament: { include: { stages: { select: { stageNumber: true }, orderBy: { stageNumber: 'asc' } } } },
        },
      })

      if (!stage) return reply.status(404).send({ error: 'Stage not found' })
      if (stage.advancePerTable === 0) {
        return reply.status(400).send({ error: 'Cannot advance from the final stage' })
      }
      if (stage.status !== 'IN_PROGRESS') {
        return reply.status(400).send({ error: 'Stage is not in progress' })
      }
      if (stage.tables.some(t => t.status !== 'COMPLETED')) {
        return reply.status(400).send({ error: 'All tables must be completed before advancing' })
      }

      // Compute totals per table, rank players, collect advancing set
      const advancing: string[] = []
      for (const table of stage.tables) {
        const totals: Record<string, number> = {}
        for (const round of table.game?.rounds ?? []) {
          for (const score of round.scores) {
            totals[score.playerId] = (totals[score.playerId] ?? 0) + score.points
          }
        }
        const realPlayers = table.players
          .filter(p => !p.isBye && p.playerId)
          .sort((a, b) => (totals[a.playerId!] ?? 0) - (totals[b.playerId!] ?? 0))

        // Take top advancePerTable, including all tied players at the boundary
        const cutoff = stage.advancePerTable - 1
        const cutoffScore = realPlayers[cutoff] != null ? totals[realPlayers[cutoff].playerId!] : Infinity
        const advanced = realPlayers.filter(
          (p, i) => i < stage.advancePerTable || totals[p.playerId!] === cutoffScore,
        )
        advancing.push(...advanced.map(p => p.playerId!))
      }

      // Find next stage number
      const nextStageNumber = stage.stageNumber + 1

      // Re-split advancing players using bracket algorithm
      const nextBracket = computeBracket(advancing.length)
      const nextDesc = nextBracket[0]
      const shuffled = [...advancing].sort(() => Math.random() - 0.5)

      const tournament = await prisma.$transaction(async (tx) => {
        // Mark advancing players
        await tx.tournamentTablePlayer.updateMany({
          where: { tableId: { in: stage.tables.map(t => t.id) }, playerId: { in: advancing } },
          data: { advanced: true },
        })
        // Mark current stage COMPLETED
        await tx.tournamentStage.update({ where: { id: stageId }, data: { status: 'COMPLETED' } })

        // Find next stage record and activate it
        const nextStage = await tx.tournamentStage.findFirst({
          where: { tournamentId: id, stageNumber: nextStageNumber },
        })
        if (!nextStage) throw new Error('Next stage not found')

        await tx.tournamentStage.update({
          where: { id: nextStage.id },
          data: { status: 'IN_PROGRESS' },
        })

        // Create tables for next stage
        for (let tableIndex = 0; tableIndex < nextDesc.tableCount; tableIndex++) {
          const tablePlayers = shuffled.slice(
            tableIndex * nextDesc.playersPerTable,
            (tableIndex + 1) * nextDesc.playersPerTable,
          )
          await tx.tournamentTable.create({
            data: {
              stageId: nextStage.id,
              tableNumber: tableIndex + 1,
              status: 'PENDING',
              players: {
                create: tablePlayers.map(pid => ({ playerId: pid, isBye: false })),
              },
            },
          })
        }

        return tx.tournament.findFirst({
          where: { id },
          include: {
            stages: {
              orderBy: { stageNumber: 'asc' },
              include: { tables: { include: { players: true } } },
            },
          },
        })
      })

      return reply.send(tournament)
    },
  )
}

export default tournamentRoutes
