import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'

const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/stats/all-time',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }

      const games = await prisma.game.findMany({
        where: { season: { groupId }, status: 'CLOSED' },
        include: {
          players: { include: { player: true } },
          rounds: { include: { scores: true } },
        },
      })

      const playerStats: Record<string, {
        playerId: string
        playerName: string
        playerAvatar: string
        totalPoints: number
        gamesPlayed: number
        wins: number
        bestGame: number | null
        worstGame: number | null
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
              bestGame: null,
              worstGame: null,
            }
          }
          playerStats[gp.playerId].gamesPlayed++
        }

        for (const round of game.rounds) {
          for (const score of round.scores) {
            gameTotals[score.playerId] = (gameTotals[score.playerId] || 0) + score.points
          }
        }

        const playerIds = Object.keys(gameTotals)
        if (playerIds.length > 0) {
          const minScore = Math.min(...playerIds.map(pid => gameTotals[pid]))
          for (const pid of playerIds) {
            const pts = gameTotals[pid]
            playerStats[pid].totalPoints += pts
            if (gameTotals[pid] === minScore) {
              playerStats[pid].wins++
            }
            if (playerStats[pid].bestGame === null || pts < playerStats[pid].bestGame!) {
              playerStats[pid].bestGame = pts
            }
            if (playerStats[pid].worstGame === null || pts > playerStats[pid].worstGame!) {
              playerStats[pid].worstGame = pts
            }
          }
        }
      }

      const leaderboard = Object.values(playerStats)
        .map(p => ({
          ...p,
          avgPoints: p.gamesPlayed > 0 ? Math.round(p.totalPoints / p.gamesPlayed) : 0,
          winRate: p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0,
        }))
        .sort((a, b) => a.avgPoints - b.avgPoints)

      return reply.send(leaderboard)
    },
  )

  fastify.get(
    '/api/players/:id/stats',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }

      const player = await prisma.player.findFirst({
        where: { id, groupId },
      })
      if (!player) {
        return reply.status(404).send({ error: 'Player not found' })
      }

      const gameScores = await prisma.game.findMany({
        where: { season: { groupId }, status: 'CLOSED', players: { some: { playerId: id } } },
        include: {
          rounds: { include: { scores: { where: { playerId: id } } } },
          players: true,
          season: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      const gameResults = gameScores.map(game => {
        const total = game.rounds.reduce((sum, round) => {
          const score = round.scores.find(s => s.playerId === id)
          return sum + (score?.points || 0)
        }, 0)

        // Find winner
        const gameTotals: Record<string, number> = {}
        for (const gp of game.players) {
          gameTotals[gp.playerId] = 0
        }
        for (const round of game.rounds) {
          // We need all scores
        }

        return {
          gameId: game.id,
          seasonId: game.season?.id ?? null,
          seasonName: game.season?.name ?? null,
          totalPoints: total,
          roundsPlayed: game.rounds.length,
          date: game.createdAt,
        }
      })

      const stats = {
        player,
        gamesPlayed: gameResults.length,
        totalPoints: gameResults.reduce((s, g) => s + g.totalPoints, 0),
        avgPoints: gameResults.length > 0
          ? Math.round(gameResults.reduce((s, g) => s + g.totalPoints, 0) / gameResults.length)
          : 0,
        bestGame: gameResults.length > 0 ? Math.min(...gameResults.map(g => g.totalPoints)) : null,
        worstGame: gameResults.length > 0 ? Math.max(...gameResults.map(g => g.totalPoints)) : null,
        recentGames: gameResults.slice(0, 10),
      }

      return reply.send(stats)
    },
  )

  fastify.get('/api/stats/alltime', { preHandler: [fastify.requireGroup] }, async (request, reply) => {
    const { groupId } = request.user as { groupId: string }

    const games = await prisma.game.findMany({
      where: { status: 'CLOSED', season: { groupId } },
      include: {
        players: { include: { player: { select: { id: true, name: true, avatar: true } } } },
        rounds: { include: { scores: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const stats: Record<string, {
      playerId: string; name: string; avatar: string | null;
      gamesPlayed: number; wins: number; totalScore: number;
      currentStreak: number; streakType: 'win' | 'loss' | null;
      badges: string[];
    }> = {}

    const playerResults: Record<string, boolean[]> = {}

    for (const game of games) {
      const gameTotals: Record<string, number> = {}
      for (const gp of game.players) gameTotals[gp.playerId] = 0
      for (const round of game.rounds) {
        for (const score of round.scores) {
          gameTotals[score.playerId] = (gameTotals[score.playerId] ?? 0) + score.points
        }
      }
      const winner = Object.entries(gameTotals).sort((a, b) => a[1] - b[1])[0]
      if (!winner) continue

      for (const gp of game.players) {
        const p = gp.player
        if (!stats[p.id]) {
          stats[p.id] = { playerId: p.id, name: p.name, avatar: p.avatar,
            gamesPlayed: 0, wins: 0, totalScore: 0,
            currentStreak: 0, streakType: null, badges: [] }
        }
        if (!playerResults[p.id]) playerResults[p.id] = []
        stats[p.id].gamesPlayed++
        stats[p.id].totalScore += gameTotals[p.id] ?? 0
        const isWin = winner[0] === p.id
        if (isWin) stats[p.id].wins++
        playerResults[p.id].push(isWin)
      }
    }

    for (const [playerId, results] of Object.entries(playerResults)) {
      if (!stats[playerId] || results.length === 0) continue
      const lastResult = results[results.length - 1]
      let streak = 0
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i] === lastResult) streak++
        else break
      }
      stats[playerId].currentStreak = streak
      stats[playerId].streakType = lastResult ? 'win' : 'loss'
    }

    for (const s of Object.values(stats)) {
      if (s.wins >= 10) s.badges.push('🏆 Champion')
      if (s.currentStreak >= 3 && s.streakType === 'win') s.badges.push('🔥 On Fire')
      if (s.currentStreak >= 3 && s.streakType === 'loss') s.badges.push('🧊 Cold Spell')
      if (s.gamesPlayed >= 20) s.badges.push('🎴 Veteran')
    }

    return reply.send(
      Object.values(stats).sort((a, b) => b.wins - a.wins || a.totalScore - b.totalScore)
    )
  })

  fastify.get('/api/stats/h2h', { preHandler: [fastify.requireGroup] }, async (request, reply) => {
    const { groupId } = request.user as { groupId: string }
    const { playerA, playerB } = request.query as { playerA: string; playerB: string }

    if (!playerA || !playerB) return reply.status(400).send({ error: 'playerA and playerB required' })

    const games = await prisma.game.findMany({
      where: {
        status: 'CLOSED',
        season: { groupId },
        players: { some: { playerId: playerA } },
        AND: [{ players: { some: { playerId: playerB } } }],
      },
      include: { rounds: { include: { scores: true } }, players: true },
    })

    let winsA = 0, winsB = 0, ties = 0
    for (const game of games) {
      const totals: Record<string, number> = {}
      for (const round of game.rounds) {
        for (const score of round.scores) {
          totals[score.playerId] = (totals[score.playerId] ?? 0) + score.points
        }
      }
      const scoreA = totals[playerA] ?? 0
      const scoreB = totals[playerB] ?? 0
      if (scoreA < scoreB) winsA++
      else if (scoreB < scoreA) winsB++
      else ties++
    }

    return reply.send({ gamesPlayed: games.length, winsA, winsB, ties })
  })
}

export default statsRoutes
