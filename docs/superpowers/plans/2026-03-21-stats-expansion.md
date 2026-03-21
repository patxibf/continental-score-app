# Stats Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add All-Time Leaderboard with streaks & badges, Head-to-Head records, and Round Breakdown chart.

**Architecture:** Two new backend endpoints added to existing `stats.ts` + new `StatsAllTime.tsx` frontend page + additions to `PlayerStats.tsx` and `GameHistory.tsx`. No new DB columns.

**Tech Stack:** Fastify, Prisma, React, TanStack Query, Recharts (already installed)

---

## File Map

- Modify: `packages/backend/src/routes/stats.ts` — add `GET /api/stats/alltime` and `GET /api/stats/h2h`
- Create: `packages/backend/src/routes/__tests__/stats.test.ts` — tests for new endpoints
- Create: `packages/frontend/src/pages/StatsAllTime.tsx` — all-time leaderboard page
- Modify: `packages/frontend/src/App.tsx` — add `/stats/alltime` route
- Modify: `packages/frontend/src/pages/Stats.tsx` — add "All-Time" link button
- Modify: `packages/frontend/src/pages/PlayerStats.tsx` — add H2H section
- Modify: `packages/frontend/src/pages/GameHistory.tsx` — add Round Breakdown BarChart
- Modify: `packages/frontend/src/lib/api.ts` — add new response types

---

### Task 1: Add `GET /api/stats/alltime` endpoint to `stats.ts`

**Files:**
- Modify: `packages/backend/src/routes/stats.ts`

This endpoint returns per-player all-time stats including win streaks and badges. It's separate from the existing `/api/stats/all-time` (which returns a different shape used by the current Stats.tsx page).

- [ ] **Step 1: Read `packages/backend/src/routes/stats.ts`**

The file exports a Fastify plugin with `GET /api/stats/all-time` and `GET /api/players/:id/stats`.

- [ ] **Step 2: Add `GET /api/stats/alltime` endpoint**

Add before the closing `}` of the plugin:
```typescript
fastify.get('/api/stats/alltime', { preHandler: [fastify.requireGroup] }, async (request, reply) => {
  const { groupId } = request.user as { groupId: string; groupAccess: string }

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

  // Build per-player ordered result list (true=win, false=loss)
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

  // Compute current streak from the end of each player's result list
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

- [ ] **Step 3: Add `GET /api/stats/h2h` endpoint**

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

- [ ] **Step 4: Build to verify**

Run: `npm run build -w packages/backend`
Expected: Build succeeds

---

### Task 2: Write backend tests for the new stat endpoints

**Files:**
- Create: `packages/backend/src/routes/__tests__/stats.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `packages/backend/src/routes/__tests__/stats.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})
afterEach(async () => { await app?.close() })

const makeGame = (id: string, players: Array<{ id: string; name: string }>, roundScores: Array<Record<string, number>>) => ({
  id,
  createdAt: new Date('2026-01-01'),
  players: players.map(p => ({ playerId: p.id, player: { id: p.id, name: p.name, avatar: 'cat' } })),
  rounds: roundScores.map((scores, i) => ({
    id: `r${i}`,
    scores: Object.entries(scores).map(([playerId, points]) => ({ playerId, points })),
  })),
})

describe('GET /api/stats/alltime', () => {
  it('returns players sorted by wins descending', async () => {
    // Player A wins 2 games (lower score), Player B wins 0
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([
      makeGame('g1', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 10, pB: 50 }]),
      makeGame('g2', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 20, pB: 80 }]),
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/alltime',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body[0].playerId).toBe('pA')
    expect(body[0].wins).toBe(2)
    expect(body[1].wins).toBe(0)
  })

  it('assigns On Fire badge for 3-game win streak', async () => {
    const games = [1, 2, 3].map(i =>
      makeGame(`g${i}`, [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 10, pB: 50 }])
    )
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce(games as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/alltime',
      cookies: { token: groupToken(app) },
    })

    const alice = res.json().find((p: any) => p.playerId === 'pA')
    expect(alice.currentStreak).toBe(3)
    expect(alice.streakType).toBe('win')
    expect(alice.badges).toContain('🔥 On Fire')
  })

  it('returns empty array when no closed games', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([])

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/alltime',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })
})

describe('GET /api/stats/h2h', () => {
  it('returns correct win/loss breakdown', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([
      makeGame('g1', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 10, pB: 50 }]),
      makeGame('g2', [{ id: 'pA', name: 'Alice' }, { id: 'pB', name: 'Bob' }], [{ pA: 80, pB: 30 }]),
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/h2h?playerA=pA&playerB=pB',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ gamesPlayed: 2, winsA: 1, winsB: 1, ties: 0 })
  })

  it('returns 400 when playerA or playerB missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats/h2h?playerA=pA',
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm test -w packages/backend`
Expected: All tests pass (existing + new stats tests)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/stats.ts \
        packages/backend/src/routes/__tests__/stats.test.ts
git commit -m "feat: add /api/stats/alltime and /api/stats/h2h endpoints"
```

---

### Task 3: Add new frontend types to `api.ts`

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`

- [ ] **Step 1: Add the new response types at the end of api.ts**

```typescript
export interface AllTimePlayer {
  playerId: string
  name: string
  avatar: string | null
  gamesPlayed: number
  wins: number
  totalScore: number
  currentStreak: number
  streakType: 'win' | 'loss' | null
  badges: string[]
}

export interface H2HResult {
  gamesPlayed: number
  winsA: number
  winsB: number
  ties: number
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build -w packages/frontend`

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/api.ts
git commit -m "feat: add AllTimePlayer and H2HResult types to api.ts"
```

---

### Task 4: Create `StatsAllTime.tsx` page

**Files:**
- Create: `packages/frontend/src/pages/StatsAllTime.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, AllTimePlayer } from '@/lib/api'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function StatsAllTime() {
  const { data: players, isLoading } = useQuery<AllTimePlayer[]>({
    queryKey: ['stats', 'alltime'],
    queryFn: () => api.get<AllTimePlayer[]>('/stats/alltime'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 fade-up">
        <div className="h-8 w-32 bg-accent animate-pulse rounded" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-accent animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center gap-3">
        <Link to="/stats">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Statistics</p>
          <h1 className="text-3xl font-bold text-[var(--cobalt-dark)]">All-Time</h1>
        </div>
      </div>

      {!players || players.length === 0 ? (
        <div className="felt-card p-12 text-center">
          <p className="text-5xl mb-4">🎴</p>
          <p className="text-muted-foreground">No stats yet — play some games first!</p>
        </div>
      ) : (
        <div className="space-y-2 stagger">
          {players.map((p, idx) => {
            const winPct = p.gamesPlayed > 0
              ? Math.round((p.wins / p.gamesPlayed) * 100)
              : 0
            const avgScore = p.gamesPlayed > 0
              ? Math.round(p.totalScore / p.gamesPlayed)
              : 0

            return (
              <div key={p.playerId} className="felt-card p-4 fade-up">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 text-center text-sm font-mono text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="text-2xl">{AVATAR_EMOJIS[p.avatar ?? ''] || '🎮'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.name}</span>
                      {p.badges.map(badge => (
                        <span
                          key={badge}
                          className="text-xs px-2 py-0.5 rounded-full bg-accent text-[var(--cobalt-dark)] border border-[rgba(37,99,235,0.2)]"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 ml-9 text-center">
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{p.gamesPlayed}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Games</p>
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{p.wins}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Wins</p>
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{winPct}%</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Win%</p>
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm text-[var(--cobalt-dark)]">{avgScore}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg pts</p>
                  </div>
                </div>
                {p.currentStreak >= 2 && (
                  <div className="ml-9 mt-2 text-xs text-muted-foreground">
                    {p.streakType === 'win' ? '🔥' : '🧊'} {p.currentStreak}-game {p.streakType} streak
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

---

### Task 5: Register `/stats/alltime` route in `App.tsx` and add link in `Stats.tsx`

**Files:**
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/pages/Stats.tsx`

- [ ] **Step 1: Update `App.tsx`**

Add import:
```typescript
import StatsAllTime from '@/pages/StatsAllTime'
```

Add route (after the `/stats/players/:id` route):
```tsx
<Route
  path="/stats/alltime"
  element={
    <ProtectedRoute>
      <Layout>
        <StatsAllTime />
      </Layout>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Add "All-Time" link button in `Stats.tsx` header**

In `Stats.tsx`, import `Link` from react-router-dom (check if already imported; if not, add it).

In the header section (after the `<p className="text-muted-foreground text-sm">` subtitle), add:
```tsx
<div className="flex items-center justify-between">
  <p className="text-muted-foreground text-sm mt-1 tracking-wide">All-time standings</p>
  <Link to="/stats/alltime">
    <Button variant="outline" size="sm" className="text-xs">All-Time →</Button>
  </Link>
</div>
```

Replace the existing subtitle paragraph with this block.

- [ ] **Step 3: Build and test**

Run: `npm run build -w packages/frontend && npm test -w packages/frontend`
Expected: Build succeeds, 27 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/StatsAllTime.tsx \
        packages/frontend/src/App.tsx \
        packages/frontend/src/pages/Stats.tsx
git commit -m "feat: add All-Time leaderboard page with streaks and badges"
```

---

### Task 6: Add H2H section to `PlayerStats.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/PlayerStats.tsx`

The player stats page already shows recentGames. We add a H2H section that shows win/loss against each opponent. We use the `/api/stats/alltime` data to get the list of all players, then make per-pair H2H queries.

**Implementation note:** Since the app has small groups (4-8 players), 3-7 H2H requests is acceptable. Use `useQuery` for each pair only when we have the player list.

- [ ] **Step 1: Add imports to `PlayerStats.tsx`**

Add to existing imports:
```typescript
import { api, H2HResult, AllTimePlayer } from '@/lib/api'
import { useQueries } from '@tanstack/react-query'
```

- [ ] **Step 2: Add alltime query to get list of other players**

Inside `PlayerStats`, after the existing stats query:
```typescript
const { data: alltimePlayers } = useQuery<AllTimePlayer[]>({
  queryKey: ['stats', 'alltime'],
  queryFn: () => api.get<AllTimePlayer[]>('/stats/alltime'),
})

const opponents = alltimePlayers?.filter(p => p.playerId !== id) ?? []

const h2hQueries = useQueries({
  queries: opponents.map(opp => ({
    queryKey: ['stats', 'h2h', id, opp.playerId],
    queryFn: () => api.get<H2HResult>(`/stats/h2h?playerA=${id}&playerB=${opp.playerId}`),
    enabled: !!id && opponents.length > 0,
  })),
})
```

- [ ] **Step 3: Add H2H section in the JSX**

After the "Recent games" section (before the closing `</div>`):
```tsx
{opponents.length > 0 && h2hQueries.some(q => q.data && q.data.gamesPlayed > 0) && (
  <div>
    <div className="suit-divider text-xs mb-4">Head-to-Head</div>
    <div className="space-y-2">
      {opponents.map((opp, i) => {
        const h2h = h2hQueries[i]?.data
        if (!h2h || h2h.gamesPlayed === 0) return null
        return (
          <div key={opp.playerId} className="felt-card px-4 py-3 flex items-center gap-3">
            <span className="text-lg">{AVATAR_EMOJIS[opp.avatar ?? ''] || '🎮'}</span>
            <span className="flex-1 text-sm font-medium">{opp.name}</span>
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className="text-[var(--cobalt-dark)] font-semibold">{h2h.winsA}W</span>
              <span className="text-muted-foreground">–</span>
              <span className="text-muted-foreground">{h2h.winsB}L</span>
              {h2h.ties > 0 && (
                <span className="text-muted-foreground">– {h2h.ties}T</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)}
```

Note: if the visual redesign has already been applied, use `var(--cobalt-dark)` for the win color. If not yet applied, use `var(--gold-bright)` — the redesign plan will update it.

- [ ] **Step 4: Build and test**

Run: `npm run build -w packages/frontend && npm test -w packages/frontend`
Expected: Build succeeds, 27 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/PlayerStats.tsx
git commit -m "feat: add head-to-head section to player stats page"
```

---

### Task 7: Add Round Breakdown BarChart to `GameHistory.tsx`

**Files:**
- Modify: `packages/frontend/src/pages/GameHistory.tsx`

GameHistory.tsx already has a round-by-round table. Add a Recharts BarChart below it. Game data already fetched includes `game.rounds` with `round.scores` including `score.player.name`.

- [ ] **Step 1: Add Recharts import to `GameHistory.tsx`**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts'
```

- [ ] **Step 2: Add chart data computation**

After the existing `const maxPts = ...` line:
```typescript
const PLAYER_COLORS = ['#2563eb', '#1e3a8a', '#3b5cc4', '#6b8ce8', '#93aaed', '#b8c9f5']

const chartData = game.rounds?.map(round => {
  const entry: Record<string, number | string> = { round: `R${round.roundNumber}` }
  for (const score of round.scores) {
    entry[score.player.name] = score.wentOut && score.points <= 0
      ? 0
      : score.points
  }
  return entry
}) ?? []

const playerNames = game.players.map(gp => gp.player.name)
```

- [ ] **Step 3: Add the BarChart section to JSX**

After the round breakdown text list (after the closing `</div>` of the stagger list), add:
```tsx
{chartData.length > 0 && playerNames.length > 0 && (
  <div className="felt-card p-5">
    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
      Points per Round
    </p>
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="round" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {playerNames.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            fill={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  </div>
)}
```

- [ ] **Step 4: Build and test**

Run: `npm run build -w packages/frontend && npm test -w packages/frontend`
Expected: Build succeeds, 27 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/GameHistory.tsx
git commit -m "feat: add round breakdown bar chart to game history page"
```

---

### Task 8: Deploy and validate

- [ ] **Step 1: Deploy backend**

```bash
npm run build -w packages/backend
tar czf /tmp/backend-dist.tar.gz packages/backend/dist packages/backend/prisma
aws s3 cp /tmp/backend-dist.tar.gz s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz
PRESIGN=$(aws s3 presign s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz --expires-in 3600)
aws ssm send-command \
  --instance-ids i-028efc7be1e688fb4 \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[
    \"export HOME=/root\",
    \"cd /home/ec2-user/continental\",
    \"curl -s '$PRESIGN' -o /tmp/backend-dist.tar.gz\",
    \"tar xzf /tmp/backend-dist.tar.gz\",
    \"npm run db:migrate:deploy -w packages/backend\",
    \"npm run db:generate -w packages/backend\",
    \"chown -R ec2-user:ec2-user packages/backend/dist packages/backend/prisma\",
    \"pm2 restart all\"
  ]"
```

- [ ] **Step 2: Deploy frontend**

```bash
npm run build -w packages/frontend
aws s3 sync packages/frontend/dist s3://continentalstack-sitebucket397a1860-v1tluopr12iw/ \
  --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
aws s3 cp packages/frontend/dist/index.html \
  s3://continentalstack-sitebucket397a1860-v1tluopr12iw/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
```

- [ ] **Step 3: Validate at https://d2f12kp396t6lu.cloudfront.net**

1. `/stats/alltime` page loads — shows player list with win counts and badges
2. Player with 3+ consecutive wins shows 🔥 On Fire badge
3. Player stats page shows H2H section with correct win/loss counts
4. Game history page shows round breakdown bar chart
5. `GET /api/stats/alltime` returns valid JSON (test via browser DevTools)
6. `GET /api/stats/h2h?playerA=X&playerB=Y` returns `{ gamesPlayed, winsA, winsB, ties }`

