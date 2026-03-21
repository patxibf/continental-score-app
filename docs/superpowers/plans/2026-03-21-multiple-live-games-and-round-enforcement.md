# Multiple Live Games + Round Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow multiple simultaneous IN_PROGRESS games per season, and prevent closing a game before all 7 rounds are played.

**Architecture:** Feature A is a pure frontend change (Dashboard.tsx uses `find` → `filter`). Feature B adds a backend validation in the game close endpoint and gates the frontend "Close Game" button behind the `isGameComplete` flag that already exists in Game.tsx.

**Tech Stack:** Fastify + Prisma (backend), React + TanStack Query + Vitest + React Testing Library (frontend), Vitest (backend tests)

---

## File Structure

**Modified files:**
- `packages/backend/src/test/helpers.ts` — register `gameRoutes` so games tests can use `buildApp()`
- `packages/backend/src/routes/games.ts:126–158` — add round-count validation to `POST /api/games/:id/close`
- `packages/frontend/src/pages/Game.tsx:316–339` — gate "Close Game" header button behind `isGameComplete`
- `packages/frontend/src/pages/Dashboard.tsx:31, 44–88` — `find` → `filter`, render array of live game banners

**New test files:**
- `packages/backend/src/routes/__tests__/games.test.ts` — close endpoint enforcement tests
- `packages/frontend/src/pages/__tests__/Game.closeButton.test.tsx` — Close Game button visibility
- `packages/frontend/src/pages/__tests__/Dashboard.liveGames.test.tsx` — multiple live game banners

---

## Task 1: Register gameRoutes in test helper

**Files:**
- Modify: `packages/backend/src/test/helpers.ts`

The existing `buildApp()` does not register `gameRoutes`, so tests for `POST /api/games/:id/close` would 404. Fix this first.

- [ ] **Step 1: Add gameRoutes import and registration**

In `packages/backend/src/test/helpers.ts`, add after the existing imports and registrations:

```typescript
import gameRoutes from '../routes/games.js'
```

And inside `buildApp()`, add after `await app.register(statsRoutes)`:

```typescript
await app.register(gameRoutes)
```

- [ ] **Step 2: Run existing tests to verify nothing broke**

```bash
cd packages/backend && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/test/helpers.ts
git commit -m "test: register gameRoutes in buildApp helper"
```

---

## Task 2: Backend — enforce all 7 rounds before close (TDD)

**Files:**
- Create: `packages/backend/src/routes/__tests__/games.test.ts`
- Modify: `packages/backend/src/routes/games.ts:126–158`

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/src/routes/__tests__/games.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

function mockGameWithRounds(n: number) {
  return {
    id: 'game-1',
    status: 'IN_PROGRESS',
    season: { id: 's1', name: 'Spring', groupId: 'group-1' },
    players: [
      { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
      { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
    ],
    rounds: Array.from({ length: n }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      scores: [
        { playerId: 'p1', points: 10, wentOut: false },
        { playerId: 'p2', points: 20, wentOut: false },
      ],
    })),
  }
}

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

describe('POST /api/games/:id/close', () => {
  it('returns 400 when game has fewer than 7 rounds', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGameWithRounds(3) as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/all 7 rounds/i)
  })

  it('returns 400 when game has 0 rounds', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGameWithRounds(0) as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/all 7 rounds/i)
  })

  it('closes game successfully when all 7 rounds are complete', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGameWithRounds(7) as any)
    vi.mocked(prisma.game.update).mockResolvedValueOnce({
      id: 'game-1',
      status: 'CLOSED',
      closedAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/close',
      payload: { confirm: true },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail with 200/other (not 400 yet)**

```bash
cd packages/backend && npm test -- games.test
```

Expected: the two 400-expecting tests FAIL (endpoint currently returns 200 for any game).

- [ ] **Step 3: Add validation in games.ts**

In `packages/backend/src/routes/games.ts`, after the `if (game.status === 'CLOSED')` check (line ~148), add:

```typescript
if (game.rounds.length < TOTAL_ROUNDS) {
  return reply.status(400).send({
    error: `Cannot close game: all ${TOTAL_ROUNDS} rounds must be completed first`,
  })
}
```

`TOTAL_ROUNDS` is already imported from `../lib/gameRules.js` at the top of the file.

- [ ] **Step 4: Run the tests — verify they all pass**

```bash
cd packages/backend && npm test -- games.test
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full backend test suite — verify no regressions**

```bash
cd packages/backend && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/__tests__/games.test.ts packages/backend/src/routes/games.ts
git commit -m "feat: reject game close if fewer than 7 rounds completed"
```

---

## Task 3: Frontend — hide "Close Game" header button when incomplete (TDD)

**Files:**
- Create: `packages/frontend/src/pages/__tests__/Game.closeButton.test.tsx`
- Modify: `packages/frontend/src/pages/Game.tsx:316–339`

Currently the "Close Game" button in the header (line ~326) is shown whenever `game.status === 'IN_PROGRESS' && isGroupAdmin`, regardless of round count. It needs to also require `isGameComplete`.

- [ ] **Step 1: Write the failing tests**

Create `packages/frontend/src/pages/__tests__/Game.closeButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import GamePage from '../Game'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))

const adminUser = { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }

function makeGame(roundCount: number) {
  return {
    id: 'game-1',
    seasonId: 's1',
    status: 'IN_PROGRESS',
    createdAt: '2026-01-01',
    players: [
      { id: 'gp1', gameId: 'game-1', playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
      { id: 'gp2', gameId: 'game-1', playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
    ],
    rounds: Array.from({ length: roundCount }, (_, i) => ({
      id: `r${i + 1}`,
      roundNumber: i + 1,
      completedAt: '2026-01-01',
      scores: [
        { id: `rs${i}a`, roundId: `r${i + 1}`, playerId: 'p1', points: 10, wentOut: false, player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { id: `rs${i}b`, roundId: `r${i + 1}`, playerId: 'p2', points: 20, wentOut: false, player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
      ],
    })),
    totals: { p1: roundCount * 10, p2: roundCount * 20 },
  }
}

function renderGamePage() {
  return renderWithProviders(<GamePage />, {
    initialEntries: ['/games/game-1'],
    routePath: '/games/:id',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GamePage — Close Game button visibility', () => {
  it('hides Close Game button when fewer than 7 rounds are played', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return adminUser
      if (path === '/games/game-1') return makeGame(3)
      return null
    })

    renderGamePage()

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^close game$/i })).not.toBeInTheDocument()
  })

  it('shows Close Game button once all 7 rounds are played', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return adminUser
      if (path === '/games/game-1') return makeGame(7)
      return null
    })

    renderGamePage()

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^close game$/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd packages/frontend && npm test -- Game.closeButton
```

Expected: the "hides" test FAILS (button is currently shown at 3 rounds too).

- [ ] **Step 3: Wrap the Close Game header button in `isGameComplete &&`**

In `packages/frontend/src/pages/Game.tsx`, find the header buttons block (around line 316–339). The current structure is:

```tsx
{game.status === 'IN_PROGRESS' && isGroupAdmin && (
  <div className="flex items-center gap-2">
    {game.rounds && game.rounds.length > 0 && (
      <Button variant="outline" size="sm" onClick={() => setUndoDialogOpen(true)} className="text-xs">
        Undo last round
      </Button>
    )}
    <Button variant="outline" size="sm" onClick={() => setAbortDialogOpen(true)} className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10">
      Abort
    </Button>
    <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)} className="text-xs">
      Close Game
    </Button>
  </div>
)}
```

Change only the "Close Game" button to be conditionally rendered:

```tsx
{game.status === 'IN_PROGRESS' && isGroupAdmin && (
  <div className="flex items-center gap-2">
    {game.rounds && game.rounds.length > 0 && (
      <Button variant="outline" size="sm" onClick={() => setUndoDialogOpen(true)} className="text-xs">
        Undo last round
      </Button>
    )}
    <Button variant="outline" size="sm" onClick={() => setAbortDialogOpen(true)} className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10">
      Abort
    </Button>
    {isGameComplete && (
      <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)} className="text-xs">
        Close Game
      </Button>
    )}
  </div>
)}
```

(`isGameComplete` is defined as `const isGameComplete = completedRounds >= 7` at line ~293, before this JSX.)

- [ ] **Step 4: Run the tests — verify they pass**

```bash
cd packages/frontend && npm test -- Game.closeButton
```

Expected: both tests PASS.

- [ ] **Step 5: Run full frontend test suite — verify no regressions**

```bash
cd packages/frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/pages/__tests__/Game.closeButton.test.tsx packages/frontend/src/pages/Game.tsx
git commit -m "feat: hide Close Game button until all 7 rounds are completed"
```

---

## Task 4: Frontend — multiple live games on Dashboard (TDD)

**Files:**
- Create: `packages/frontend/src/pages/__tests__/Dashboard.liveGames.test.tsx`
- Modify: `packages/frontend/src/pages/Dashboard.tsx:31, 44–88`

Currently `Dashboard.tsx` uses `recentGames?.find(...)` which returns only the first IN_PROGRESS game. Needs to become `filter` and render all of them.

- [ ] **Step 1: Write the failing tests**

Create `packages/frontend/src/pages/__tests__/Dashboard.liveGames.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/wrapper'
import Dashboard from '../Dashboard'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const activeSeason = {
  id: 's1', name: 'Spring 2026', status: 'ACTIVE', groupId: 'g1',
  createdAt: '2026-01-01', _count: { games: 2, players: 3 },
}

function makeInProgressGame(id: string) {
  return {
    id,
    seasonId: 's1',
    status: 'IN_PROGRESS',
    createdAt: '2026-01-01',
    players: [
      { id: `gp-${id}`, gameId: id, playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
    ],
    _count: { rounds: 2 },
  }
}

function renderDashboard() {
  return renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }
    if (path === '/seasons') return [activeSeason]
    if (path === '/seasons/s1/games') return []
    if (path === '/seasons/s1/standings') return []
    return []
  })
})

describe('Dashboard — live games', () => {
  it('shows no live game banner when there are no in-progress games', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Spring 2026')).toBeInTheDocument())
    expect(screen.queryByText('Live Game')).not.toBeInTheDocument()
  })

  it('shows one banner for a single in-progress game', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }
      if (path === '/seasons') return [activeSeason]
      if (path === '/seasons/s1/games') return [makeInProgressGame('game-1')]
      if (path === '/seasons/s1/standings') return []
      return []
    })

    renderDashboard()

    await waitFor(() => expect(screen.getAllByText('Live Game')).toHaveLength(1))
  })

  it('shows two banners when two games are simultaneously in-progress', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/auth/me') return { role: 'group', groupAccess: 'admin', groupId: 'g1', groupName: 'TestGroup' }
      if (path === '/seasons') return [activeSeason]
      if (path === '/seasons/s1/games') return [makeInProgressGame('game-1'), makeInProgressGame('game-2')]
      if (path === '/seasons/s1/standings') return []
      return []
    })

    renderDashboard()

    await waitFor(() => expect(screen.getAllByText('Live Game')).toHaveLength(2))
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd packages/frontend && npm test -- Dashboard.liveGames
```

Expected: the "two banners" test FAILS (only one banner renders with current `find`).

- [ ] **Step 3: Update Dashboard.tsx**

In `packages/frontend/src/pages/Dashboard.tsx`:

**Line 31** — change `find` to `filter`:
```tsx
// Before:
const inProgressGame = recentGames?.find(g => g.status === 'IN_PROGRESS')

// After:
const inProgressGames = recentGames?.filter(g => g.status === 'IN_PROGRESS') ?? []
```

**Lines 44–88** — change single conditional banner to mapped array:
```tsx
// Before:
{inProgressGame && (
  <Link to={`/games/${inProgressGame.id}`}>
    <div className="relative overflow-hidden rounded-xl border border-[rgba(37,99,235,0.35)] bg-white p-5 gold-glow transition-all duration-300 hover:border-[rgba(37,99,235,0.55)]">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--cobalt)] opacity-[0.04] rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[var(--cobalt)] animate-pulse" />
            <span className="text-xs uppercase tracking-widest text-[var(--cobalt)]">Live Game</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Round {(inProgressGame._count?.rounds || 0) + 1} of 7
          </p>
          <div className="flex gap-2 mt-3">
            {inProgressGame.players.map(gp => (
              <span key={gp.playerId} className="text-xl" title={gp.player.name}>
                {AVATAR_EMOJIS[gp.player.avatar] || '🎮'}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className="text-[var(--cobalt)] text-sm font-medium">Continue →</span>
          <div className="flex gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="w-4 h-1 rounded-full"
                style={{
                  background: i < (inProgressGame._count?.rounds || 0)
                    ? 'var(--cobalt)'
                    : i === (inProgressGame._count?.rounds || 0)
                    ? 'rgba(37,99,235,0.4)'
                    : 'rgba(37,99,235,0.1)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </Link>
)}

// After:
{inProgressGames.map(game => (
  <Link key={game.id} to={`/games/${game.id}`}>
    <div className="relative overflow-hidden rounded-xl border border-[rgba(37,99,235,0.35)] bg-white p-5 gold-glow transition-all duration-300 hover:border-[rgba(37,99,235,0.55)]">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--cobalt)] opacity-[0.04] rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[var(--cobalt)] animate-pulse" />
            <span className="text-xs uppercase tracking-widest text-[var(--cobalt)]">Live Game</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Round {(game._count?.rounds || 0) + 1} of 7
          </p>
          <div className="flex gap-2 mt-3">
            {game.players.map(gp => (
              <span key={gp.playerId} className="text-xl" title={gp.player.name}>
                {AVATAR_EMOJIS[gp.player.avatar] || '🎮'}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className="text-[var(--cobalt)] text-sm font-medium">Continue →</span>
          <div className="flex gap-1">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="w-4 h-1 rounded-full"
                style={{
                  background: i < (game._count?.rounds || 0)
                    ? 'var(--cobalt)'
                    : i === (game._count?.rounds || 0)
                    ? 'rgba(37,99,235,0.4)'
                    : 'rgba(37,99,235,0.1)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </Link>
))}
```

- [ ] **Step 4: Run the tests — verify they all pass**

```bash
cd packages/frontend && npm test -- Dashboard.liveGames
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full frontend test suite — verify no regressions**

```bash
cd packages/frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/pages/__tests__/Dashboard.liveGames.test.tsx packages/frontend/src/pages/Dashboard.tsx
git commit -m "feat: show all live games on Dashboard (support multiple simultaneous games)"
```
