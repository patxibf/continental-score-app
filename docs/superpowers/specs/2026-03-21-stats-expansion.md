# Stats Expansion

**Goal:** Add four new statistics features: All-Time Leaderboard (cross-season), Head-to-Head records, Streaks & Badges, and Round Breakdown Charts.

**Architecture:** New backend query methods in `stats.ts` + new frontend pages/sections. No new DB columns — all stats are computed from existing game/round/score data at query time. Recharts (already installed) used for charts.

**Tech Stack:** Fastify, Prisma, React, TanStack Query, Recharts

---

## Backend: New Stat Endpoints

All added to `packages/backend/src/routes/stats.ts`.

### GET /api/stats/alltime

Returns per-player all-time stats across all seasons in the group.

```typescript
fastify.get('/api/stats/alltime', { preHandler: [fastify.requireGroup] }, async (request, reply) => {
  const { groupId } = request.user as { groupId: string; groupAccess: string }

  // All games ever closed in this group
  const games = await prisma.game.findMany({
    where: { status: 'CLOSED', season: { groupId } },
    include: {
      players: { include: { player: { select: { id: true, name: true, avatar: true } } } },
      rounds: { include: { scores: true } },
    },
  })

  // Aggregate per player
  const stats: Record<string, {
    playerId: string; name: string; avatar: string | null;
    gamesPlayed: number; wins: number; totalScore: number;
    currentStreak: number; streakType: 'win' | 'loss' | null;
    badges: string[];
  }> = {}

  for (const game of games) {
    // Compute totals per player in this game
    const gameTotals: Record<string, number> = {}
    for (const gp of game.players) gameTotals[gp.playerId] = 0
    for (const round of game.rounds) {
      for (const score of round.scores) {
        gameTotals[score.playerId] = (gameTotals[score.playerId] ?? 0) + score.points
      }
    }
    const winner = Object.entries(gameTotals).sort((a, b) => a[1] - b[1])[0]

    for (const gp of game.players) {
      const p = gp.player
      if (!stats[p.id]) {
        stats[p.id] = { playerId: p.id, name: p.name, avatar: p.avatar,
          gamesPlayed: 0, wins: 0, totalScore: 0,
          currentStreak: 0, streakType: null, badges: [] }
      }
      stats[p.id].gamesPlayed++
      stats[p.id].totalScore += gameTotals[p.id] ?? 0
      if (winner[0] === p.id) stats[p.id].wins++
    }
  }

  // Compute streaks from game history (chronological order by game.createdAt)
  // Games are already fetched; sort by createdAt ascending to get chronological order
  const sortedGames = [...games].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // Build per-player ordered result list (win=true, loss=false)
  const playerResults: Record<string, boolean[]> = {}
  for (const game of sortedGames) {
    const gameTotalsForStreak: Record<string, number> = {}
    for (const gp of game.players) gameTotalsForStreak[gp.playerId] = 0
    for (const round of game.rounds) {
      for (const score of round.scores) {
        gameTotalsForStreak[score.playerId] = (gameTotalsForStreak[score.playerId] ?? 0) + score.points
      }
    }
    const winnerIdForStreak = Object.entries(gameTotalsForStreak).sort((a, b) => a[1] - b[1])[0][0]
    for (const gp of game.players) {
      if (!playerResults[gp.playerId]) playerResults[gp.playerId] = []
      playerResults[gp.playerId].push(gp.playerId === winnerIdForStreak)
    }
  }

  // Count current streak (consecutive wins or losses from the end of the list)
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

  // Assign badges
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
```

### GET /api/stats/h2h

Returns head-to-head results between two players.

```typescript
fastify.get('/api/stats/h2h', { preHandler: [fastify.requireGroup] }, async (request, reply) => {
  const { groupId } = request.user as { groupId: string; groupAccess: string }
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
```

---

## Frontend: New Pages & Sections

### All-Time Leaderboard Page

**File:** `packages/frontend/src/pages/StatsAllTime.tsx` (new)

Route: `/stats/alltime`

Displays a sortable table: Rank | Player | Games | Wins | Win% | Avg Score | Streak | Badges

Linked from the existing `/stats` page with a "All-Time" button (a `<Link>` navigating to `/stats/alltime`). No layout restructuring — it's a standalone page, not a tab within an existing layout component.

### Head-to-Head Section

**File:** `packages/frontend/src/pages/PlayerStats.tsx` (modify existing)

On the individual player stats page, add a H2H section. The data comes from the single `GET /api/stats/alltime` call already made on this page — no additional requests needed. From the alltime response, derive H2H by cross-referencing the `/api/stats/h2h` endpoint only when needed for a specific pair (e.g., user clicks a player to see detail). For the summary table, use a single `GET /api/stats/h2h?playerA=:id&playerB=:otherId` per opponent — this app has small groups (typically 4-8 players), so 3-7 requests is acceptable. Only show players with ≥ 1 shared game.

### Streaks & Badges

Rendered in two places:
1. **All-Time page** — badge chips next to player name in the leaderboard
2. **Player Stats page** — "Current streak" stat card and badge row

Data comes from the `/api/stats/alltime` response.

### Round Breakdown Chart

**File:** `packages/frontend/src/pages/GameHistory.tsx` (modify existing)

Add a Recharts `BarChart` below the round-by-round table. X-axis = rounds 1-7, each bar group = one player, Y-axis = points scored that round. Uses existing game data already fetched by `GET /api/games/:id`.

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

const chartData = game.rounds.map(round => {
  const entry: Record<string, number | string> = { round: `R${round.roundNumber}` }
  for (const score of round.scores) {
    entry[score.player.name] = score.points
  }
  return entry
})

const PLAYER_COLORS = ['#2563eb','#1e3a8a','#3b5cc4','#6b8ce8','#93aaed','#b8c9f5']
```

---

## Testing

```bash
npm test -w packages/backend   # new alltime + h2h endpoint tests pass
npm test -w packages/frontend  # 27 tests pass
npm run build -w packages/frontend
```

Backend tests cover:
- `GET /api/stats/alltime` returns correct win counts and streaks
- `GET /api/stats/h2h` returns correct win/loss breakdown
- Returns 400 when playerA or playerB missing

---

## Deployment

**Backend:**
```bash
npm run build -w packages/backend
tar czf /tmp/backend-dist.tar.gz packages/backend/dist packages/backend/prisma
aws s3 cp /tmp/backend-dist.tar.gz s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz
# SSM: presign → extract → migrate → generate → chown → pm2 restart
```

**Frontend:**
```bash
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

---

## Validation

1. `/stats/alltime` page loads and shows all players with win counts and badges
2. Player stats page shows H2H section with correct win/loss against each opponent
3. Streaks display correctly (e.g. a player with 3 consecutive wins shows 🔥 badge)
4. Game history page shows the round breakdown bar chart
5. API: `GET /api/stats/alltime` and `GET /api/stats/h2h?playerA=X&playerB=Y` return valid JSON
