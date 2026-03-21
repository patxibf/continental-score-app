# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest unit and component tests across backend and frontend for deploy confidence and living documentation.

**Architecture:** Backend tests use Fastify's `inject()` with a mocked Prisma client (no real DB). Frontend tests use React Testing Library with a mocked `api` module and a shared `renderWithProviders` wrapper. Both packages use Vitest with a minimal config.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, jsdom, bcryptjs (real, not mocked in auth tests)

**Spec:** `docs/superpowers/specs/2026-03-21-test-suite-design.md`

---

## File Map

**Created:**
- `packages/backend/vitest.config.ts` — Vitest config for backend (node env)
- `packages/backend/src/lib/__mocks__/prisma.ts` — Manual Prisma mock (vi.fn() stubs)
- `packages/backend/src/test/helpers.ts` — `buildApp()` factory + JWT helpers
- `packages/backend/src/lib/__tests__/gameRules.test.ts`
- `packages/backend/src/routes/__tests__/auth.test.ts`
- `packages/backend/src/routes/__tests__/admin.test.ts`
- `packages/backend/src/routes/__tests__/rounds.test.ts`
- `packages/backend/src/routes/__tests__/seasons.test.ts`
- `packages/frontend/vitest.config.ts` — Vitest config (jsdom env, merges Vite config)
- `packages/frontend/src/test/setup.ts` — jest-dom matchers import
- `packages/frontend/src/test/wrapper.tsx` — `renderWithProviders()` helper
- `packages/frontend/src/lib/__tests__/api.test.ts`
- `packages/frontend/src/lib/__tests__/utils.test.ts`
- `packages/frontend/src/hooks/__tests__/useAuth.test.tsx`
- `packages/frontend/src/pages/__tests__/Game.ScoreEntry.test.tsx`
- `packages/frontend/src/pages/__tests__/SeasonDetail.standings.test.tsx`

**Modified:**
- `packages/backend/package.json` — add vitest, @vitest/coverage-v8, test scripts
- `packages/frontend/package.json` — add vitest, @testing-library/* deps, test scripts
- `package.json` (root) — add test/test:watch/test:coverage scripts

---

## Task 1: Backend — install dependencies and create infrastructure

**Files:**
- Modify: `packages/backend/package.json`
- Create: `packages/backend/vitest.config.ts`
- Create: `packages/backend/src/lib/__mocks__/prisma.ts`
- Create: `packages/backend/src/test/helpers.ts`

- [ ] **Step 1: Install backend test dependencies**

```bash
cd packages/backend && npm install --save-dev vitest @vitest/coverage-v8
```

Expected: `node_modules/vitest` and `node_modules/@vitest/coverage-v8` present.

- [ ] **Step 2: Add test scripts to `packages/backend/package.json`**

Add to the `"scripts"` object:
```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create `packages/backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 4: Create `packages/backend/src/lib/__mocks__/prisma.ts`**

This is the manual mock Vitest uses whenever a test calls `vi.mock('../../lib/prisma.js')`.

```ts
import { vi } from 'vitest'

export const prisma = {
  admin: {
    findUnique: vi.fn(),
  },
  group: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  game: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  round: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  roundScore: {
    deleteMany: vi.fn(),
  },
  season: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}
```

- [ ] **Step 5: Create `packages/backend/src/test/helpers.ts`**

```ts
import Fastify, { FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import authPlugin from '../plugins/auth.js'
import authRoutes from '../routes/auth.js'
import adminRoutes from '../routes/admin.js'
import roundRoutes from '../routes/rounds.js'
import seasonRoutes from '../routes/seasons.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: 'test-secret-32-chars-minimum-ok',
    cookie: { cookieName: 'token', signed: false },
  })
  await app.register(authPlugin)
  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(roundRoutes)
  await app.register(seasonRoutes)

  await app.ready()
  return app
}

export function groupToken(app: FastifyInstance, groupId = 'group-1'): string {
  return app.jwt.sign({ role: 'group', groupId })
}

export function adminToken(app: FastifyInstance, adminId = 'admin-1'): string {
  return app.jwt.sign({ role: 'admin', adminId })
}
```

- [ ] **Step 6: Verify infrastructure builds — run with no test files yet**

```bash
cd packages/backend && npm test 2>&1 | head -5
```

Expected: `No test files found` or similar (not a build error).

- [ ] **Step 7: Commit**

```bash
git add packages/backend/vitest.config.ts packages/backend/src/lib/__mocks__/prisma.ts packages/backend/src/test/helpers.ts packages/backend/package.json
git commit -m "test(backend): add vitest infrastructure, prisma mock, buildApp helper"
```

---

## Task 2: Backend — gameRules unit tests

**Files:**
- Create: `packages/backend/src/lib/__tests__/gameRules.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest'
import { ROUNDS, getRoundInfo, TOTAL_ROUNDS } from '../gameRules.js'

describe('gameRules', () => {
  describe('ROUNDS', () => {
    it('has exactly 7 rounds', () => {
      expect(ROUNDS).toHaveLength(7)
    })

    it('round 1 deals 7 cards and is Two trios', () => {
      expect(ROUNDS[0]).toMatchObject({ roundNumber: 1, cardsDealt: 7, description: 'Two trios' })
    })

    it('round 7 deals 13 cards and is Three runs', () => {
      expect(ROUNDS[6]).toMatchObject({ roundNumber: 7, cardsDealt: 13, description: 'Three runs' })
    })
  })

  describe('TOTAL_ROUNDS', () => {
    it('is 7', () => {
      expect(TOTAL_ROUNDS).toBe(7)
    })
  })

  describe('getRoundInfo', () => {
    it('returns the correct info for each round 1–7', () => {
      for (let n = 1; n <= 7; n++) {
        const info = getRoundInfo(n)
        expect(info).toBeDefined()
        expect(info!.roundNumber).toBe(n)
      }
    })

    it('returns undefined for round 0', () => {
      expect(getRoundInfo(0)).toBeUndefined()
    })

    it('returns undefined for round 8', () => {
      expect(getRoundInfo(8)).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
cd packages/backend && npm test
```

Expected: `3 tests passed` (or similar count), 0 failures.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lib/__tests__/gameRules.test.ts
git commit -m "test(backend): gameRules unit tests"
```

---

## Task 3: Backend — auth route tests

**Files:**
- Create: `packages/backend/src/routes/__tests__/auth.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { buildApp, groupToken, adminToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

describe('POST /api/auth/login', () => {
  it('sets a cookie and returns role on valid admin credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1',
      username: 'admin',
      passwordHash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'correct-password' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'admin' })
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1',
      username: 'admin',
      passwordHash,
    } as any)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'Invalid credentials' })
  })

  it('sets a cookie and returns groupId on valid group credentials', async () => {
    const passwordHash = await bcrypt.hash('group-pass', 10)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1',
      username: 'mygroup',
      name: 'My Group',
      passwordHash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'mygroup', password: 'group-pass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupId: 'group-1' })
    expect(res.headers['set-cookie']).toBeDefined()
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the token cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    })

    expect(res.statusCode).toBe(200)
    // Cookie cleared = set-cookie header with empty value and past max-age
    const cookie = res.headers['set-cookie'] as string
    expect(cookie).toMatch(/token=;/)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user info when authenticated as group', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1',
      name: 'My Group',
      username: 'mygroup',
    } as any)

    const token = groupToken(app, 'group-1')
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupId: 'group-1' })
  })

  it('returns 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/backend && npm test
```

Expected: all auth tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/__tests__/auth.test.ts
git commit -m "test(backend): auth route tests"
```

---

## Task 4: Backend — admin route tests

**Files:**
- Create: `packages/backend/src/routes/__tests__/admin.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, adminToken, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

describe('POST /api/admin/groups', () => {
  it('creates a group and returns 201', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null) // username not taken
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new',
      name: 'Test Group',
      username: 'testgroup',
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test Group', username: 'testgroup', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ name: 'Test Group', username: 'testgroup' })
  })

  it('returns 400 when username is shorter than 3 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'ab', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when password is shorter than 6 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'testgroup', password: '123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 when called by a non-admin (group role)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'testgroup', password: 'secret123' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 401 when no cookie is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', username: 'testgroup', password: 'secret123' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('DELETE /api/admin/groups/:id', () => {
  it('returns 204 on successful delete', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({ id: 'g1' } as any)
    vi.mocked(prisma.group.delete).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/g1',
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(204)
  })

  it('returns 403 when called by a group user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/groups/g1',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/backend && npm test
```

Expected: all admin tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/__tests__/admin.test.ts
git commit -m "test(backend): admin route tests"
```

---

## Task 5: Backend — rounds route tests

**Files:**
- Create: `packages/backend/src/routes/__tests__/rounds.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance

// Minimal game fixture with 2 players and no existing rounds
const mockGame = (overrides = {}) => ({
  id: 'game-1',
  status: 'IN_PROGRESS',
  players: [
    { playerId: 'p1' },
    { playerId: 'p2' },
  ],
  rounds: [],
  ...overrides,
})

// Score payload for 2 players, no one out
const normalScores = [
  { playerId: 'p1', points: 15, wentOut: false, wentOutInOneGo: false },
  { playerId: 'p2', points: 30, wentOut: false, wentOutInOneGo: false },
]

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

describe('POST /api/games/:gameId/rounds', () => {
  it('stores 0 points for the player who went out (not one-go)', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)
    vi.mocked(prisma.round.create).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 1,
      scores: [
        { playerId: 'p1', points: 0, wentOut: true, player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
        { playerId: 'p2', points: 25, wentOut: false, player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
      ],
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 25, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(201)
    // The create call should have received points: 0 for the wentOut player
    const createCall = vi.mocked(prisma.round.create).mock.calls[0][0]
    const p1Score = createCall.data.scores.create.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(0)
  })

  it('stores -10 points for round 1 one-go', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'r1', roundNumber: 1, scores: [] } as any)

    await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: true },
          { playerId: 'p2', points: 25, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    const createCall = vi.mocked(prisma.round.create).mock.calls[0][0]
    const p1Score = createCall.data.scores.create.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(-10)
  })

  it('stores -70 points for round 7 one-go', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)
    vi.mocked(prisma.round.create).mockResolvedValueOnce({ id: 'r7', roundNumber: 7, scores: [] } as any)

    await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 7,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: true },
          { playerId: 'p2', points: 25, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    const createCall = vi.mocked(prisma.round.create).mock.calls[0][0]
    const p1Score = createCall.data.scores.create.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(-70)
  })

  it('returns 409 if the round was already submitted', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(
      mockGame({ rounds: [{ roundNumber: 1 }] }) as any,
    )

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: { roundNumber: 1, scores: normalScores },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(409)
  })

  it('returns 400 if a game player is missing from the scores payload', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [{ playerId: 'p1', points: 15, wentOut: false, wentOutInOneGo: false }], // p2 missing
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 if two players both have wentOut: true', async () => {
    vi.mocked(prisma.game.findFirst).mockResolvedValueOnce(mockGame() as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: {
        roundNumber: 1,
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 0, wentOut: true, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games/game-1/rounds',
      payload: { roundNumber: 1, scores: normalScores },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/rounds/:id', () => {
  it('recomputes points correctly on edit (one-go round 3 → -30)', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 3,
      game: { status: 'IN_PROGRESS', season: { groupId: 'group-1' } },
    } as any)
    vi.mocked(prisma.roundScore.deleteMany).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.round.update).mockResolvedValueOnce({ id: 'r1', roundNumber: 3, scores: [] } as any)

    await app.inject({
      method: 'PATCH',
      url: '/api/rounds/r1',
      payload: {
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: true },
          { playerId: 'p2', points: 20, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    const updateCall = vi.mocked(prisma.round.update).mock.calls[0][0]
    const p1Score = updateCall.data.scores.create.find((s: any) => s.playerId === 'p1')
    expect(p1Score.points).toBe(-30)
  })

  it('returns 403 when the game is already CLOSED', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 1,
      game: { status: 'CLOSED', season: { groupId: 'group-1' } },
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/rounds/r1',
      payload: {
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 20, wentOut: false, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 400 if two players both have wentOut: true', async () => {
    vi.mocked(prisma.round.findFirst).mockResolvedValueOnce({
      id: 'r1',
      roundNumber: 1,
      game: { status: 'IN_PROGRESS', season: { groupId: 'group-1' } },
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/rounds/r1',
      payload: {
        scores: [
          { playerId: 'p1', points: 0, wentOut: true, wentOutInOneGo: false },
          { playerId: 'p2', points: 0, wentOut: true, wentOutInOneGo: false },
        ],
      },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/backend && npm test
```

Expected: all rounds tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/__tests__/rounds.test.ts
git commit -m "test(backend): rounds route tests — one-go scoring, validation"
```

---

## Task 6: Backend — seasons standings tests

**Files:**
- Create: `packages/backend/src/routes/__tests__/seasons.test.ts`

- [ ] **Step 1: Create the test file**

```ts
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

afterEach(async () => {
  await app?.close()
})

// Builds a closed game with two players and their round scores
function makeGame(p1Total: number, p2Total: number) {
  return {
    id: `game-${Math.random()}`,
    players: [
      { playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
      { playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
    ],
    rounds: [
      {
        scores: [
          { playerId: 'p1', points: p1Total },
          { playerId: 'p2', points: p2Total },
        ],
      },
    ],
  }
}

describe('GET /api/seasons/:id/standings', () => {
  it('returns standings sorted by lowest total points ascending', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([makeGame(45, 67)] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    const standings = res.json()
    expect(standings[0].playerName).toBe('Alice')   // 45 pts
    expect(standings[1].playerName).toBe('Bob')     // 67 pts
  })

  it('gives the win to the player with the lowest score', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([makeGame(30, 80)] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    const standings = res.json()
    const alice = standings.find((s: any) => s.playerName === 'Alice')
    const bob = standings.find((s: any) => s.playerName === 'Bob')
    expect(alice.wins).toBe(1)
    expect(bob.wins).toBe(0)
  })

  it('gives both players a win when they tie', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([makeGame(50, 50)] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    const standings = res.json()
    for (const s of standings) {
      expect(s.wins).toBe(1)
    }
  })

  it('returns an empty array for a season with no closed games', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce({ id: 's1', groupId: 'group-1' } as any)
    vi.mocked(prisma.game.findMany).mockResolvedValueOnce([] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/s1/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('returns 404 for a season belonging to a different group', async () => {
    vi.mocked(prisma.season.findFirst).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons/other-season/standings',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/backend && npm test
```

Expected: all backend tests pass (should be ~25 total now).

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/__tests__/seasons.test.ts
git commit -m "test(backend): season standings tests — sort, wins, ties, isolation"
```

---

## Task 7: Frontend — install dependencies and create infrastructure

**Files:**
- Modify: `packages/frontend/package.json`
- Create: `packages/frontend/vitest.config.ts`
- Create: `packages/frontend/src/test/setup.ts`
- Create: `packages/frontend/src/test/wrapper.tsx`

- [ ] **Step 1: Install frontend test dependencies**

```bash
cd packages/frontend && npm install --save-dev vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add test scripts to `packages/frontend/package.json`**

Add to the `"scripts"` object:
```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create `packages/frontend/vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    server: { proxy: {} },  // prevent Vite proxy from leaking into test environment
  },
}))
```

- [ ] **Step 4: Create `packages/frontend/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Create `packages/frontend/src/test/wrapper.tsx`**

```tsx
import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

interface WrapperOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[]
  routePath?: string
}

export function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ['/'], routePath, ...options }: WrapperOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          {routePath ? (
            <Routes>
              <Route path={routePath} element={<>{children}</>} />
            </Routes>
          ) : (
            children
          )}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}
```

- [ ] **Step 6: Verify setup is importable**

```bash
cd packages/frontend && npm test 2>&1 | head -5
```

Expected: `No test files found` or similar (not a build error).

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/vitest.config.ts packages/frontend/src/test/setup.ts packages/frontend/src/test/wrapper.tsx packages/frontend/package.json
git commit -m "test(frontend): add vitest infrastructure, renderWithProviders helper"
```

---

## Task 8: Frontend — api.ts unit tests

**Files:**
- Create: `packages/frontend/src/lib/__tests__/api.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api'

// Replace global fetch with a vi.fn() before each test
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('api — Content-Type header', () => {
  it('does NOT send Content-Type when no body is provided (GET, DELETE)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse({ data: 1 }))

    await api.get('/test')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.['Content-Type']).toBeUndefined()
  })

  it('sends Content-Type: application/json when a body is provided (POST)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse({ ok: true }))

    await api.post('/test', { name: 'value' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('api — error handling', () => {
  it('throws with the error.error field on a plain error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse({ error: 'Not found' }, 404),
    )

    await expect(api.get('/missing')).rejects.toThrow('Not found')
  })

  it('extracts and joins fieldErrors from a Zod validation response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(
        {
          error: 'Invalid request',
          details: {
            fieldErrors: {
              username: ['String must contain at least 3 character(s)'],
              password: ['String must contain at least 6 character(s)'],
            },
          },
        },
        400,
      ),
    )

    await expect(api.post('/groups', {})).rejects.toThrow(
      'String must contain at least 3 character(s), String must contain at least 6 character(s)',
    )
  })

  it('falls back to "Request failed" when response body cannot be parsed as JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    } as unknown as Response)

    await expect(api.get('/error')).rejects.toThrow('Request failed')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/frontend && npm test
```

Expected: all api tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/__tests__/api.test.ts
git commit -m "test(frontend): api.ts unit tests — headers, error extraction"
```

---

## Task 9: Frontend — utils.ts unit tests

**Files:**
- Create: `packages/frontend/src/lib/__tests__/utils.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest'
import { ROUNDS_INFO, AVATAR_EMOJIS } from '../utils'

describe('ROUNDS_INFO', () => {
  it('has exactly 7 entries', () => {
    expect(ROUNDS_INFO).toHaveLength(7)
  })

  it('round 1 deals 7 cards', () => {
    expect(ROUNDS_INFO[0].cardsDealt).toBe(7)
  })

  it('round 7 deals 13 cards', () => {
    expect(ROUNDS_INFO[6].cardsDealt).toBe(13)
  })

  it('roundNumbers are 1 through 7 in order', () => {
    ROUNDS_INFO.forEach((r, i) => {
      expect(r.roundNumber).toBe(i + 1)
    })
  })
})

describe('AVATAR_EMOJIS', () => {
  it('returns an emoji string for known keys', () => {
    expect(typeof AVATAR_EMOJIS['cat']).toBe('string')
    expect(AVATAR_EMOJIS['cat'].length).toBeGreaterThan(0)
  })

  it('returns an emoji for all 15 avatar options', () => {
    const keys = ['cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
      'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra']
    for (const key of keys) {
      expect(AVATAR_EMOJIS[key]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/frontend && npm test
```

Expected: all utils tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/__tests__/utils.test.ts
git commit -m "test(frontend): utils.ts unit tests — ROUNDS_INFO, AVATAR_EMOJIS"
```

---

## Task 10: Frontend — useAuth hook tests

**Files:**
- Create: `packages/frontend/src/hooks/__tests__/useAuth.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { useAuth } from '../useAuth'

// Mock the api module so we control what login/logout return
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  }
})
import { api } from '@/lib/api'

// Mock useNavigate to capture navigation calls
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual as object, useNavigate: () => mockNavigate }
})

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockResolvedValue(undefined as any) // /auth/me returns nothing by default
})

describe('useAuth — login', () => {
  it('navigates to /admin when logged in as admin', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ role: 'admin', username: 'admin' })

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.login({ username: 'admin', password: 'pass' }) })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin'))
  })

  it('navigates to /dashboard when logged in as group', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ role: 'group', groupId: 'g1', groupName: 'My Group' })

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.login({ username: 'mygroup', password: 'pass' }) })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('useAuth — logout', () => {
  it('navigates to /login when logout API call succeeds', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({})

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.logout() })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('still navigates to /login when logout API call fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    act(() => { result.current.logout() })

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/frontend && npm test
```

Expected: all useAuth tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/hooks/__tests__/useAuth.test.tsx
git commit -m "test(frontend): useAuth hook tests — login navigation, logout resilience"
```

---

## Task 11: Frontend — ScoreEntry component tests

**Files:**
- Create: `packages/frontend/src/pages/__tests__/Game.ScoreEntry.test.tsx`

- [ ] **Step 1: Fix empty-score validation in `Game.tsx`**

The current code has `parseInt(effectiveScore || '0', 10)` which coalesces an empty string to `'0'`, making the `isNaN` guard unreachable on rounds 1–6. Remove the `|| '0'` fallback so that empty fields produce `NaN` and trigger the toast.

In `packages/frontend/src/pages/Game.tsx`, in the `handleSubmit` function, change:
```ts
      points: isOut ? 0 : parseInt(effectiveScore || '0', 10),
```
to:
```ts
      points: isOut ? 0 : parseInt(effectiveScore, 10),
```

- [ ] **Step 1b: Export `ScoreEntry` from `Game.tsx`**

In `packages/frontend/src/pages/Game.tsx`, change:
```ts
function ScoreEntry({
```
to:
```ts
export function ScoreEntry({
```

- [ ] **Step 1c: Create the test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreEntry } from '../Game'
import type { Game as GameType } from '@/lib/api'

// ScoreEntry renders Input and Button from shadcn — they don't need any special setup

const mockGame: GameType = {
  id: 'game-1',
  seasonId: 's1',
  status: 'IN_PROGRESS',
  createdAt: '2026-01-01',
  players: [
    { id: 'gp1', gameId: 'game-1', playerId: 'p1', player: { id: 'p1', name: 'Alice', avatar: 'cat' } },
    { id: 'gp2', gameId: 'game-1', playerId: 'p2', player: { id: 'p2', name: 'Bob', avatar: 'fox' } },
  ],
}

// Suppress toast in tests (useToast uses a context that may not be present)
vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}))
import { toast } from '@/hooks/useToast'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ScoreEntry — rendering', () => {
  it('renders all player names', () => {
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})

describe('ScoreEntry — went out toggle', () => {
  it('first tap marks player as OUT with 0 displayed', async () => {
    const user = userEvent.setup()
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)

    await user.click(screen.getByText('Alice').closest('button')!)

    expect(screen.getByText(/OUT 🏆/)).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('second tap cycles to ONE GO with negative score', async () => {
    const user = userEvent.setup()
    render(<ScoreEntry game={mockGame} roundNumber={3} onSubmit={vi.fn()} isSubmitting={false} />)

    const aliceBtn = screen.getByText('Alice').closest('button')!
    await user.click(aliceBtn) // first tap → OUT
    await user.click(aliceBtn) // second tap → ONE GO

    expect(screen.getByText(/ONE GO ⚡/)).toBeInTheDocument()
    expect(screen.getByText('-30')).toBeInTheDocument()
  })

  it('third tap deselects and restores the score input', async () => {
    const user = userEvent.setup()
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)

    const aliceBtn = screen.getByText('Alice').closest('button')!
    await user.click(aliceBtn) // → OUT
    await user.click(aliceBtn) // → ONE GO
    await user.click(aliceBtn) // → unselected

    expect(screen.queryByText(/OUT 🏆/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ONE GO/)).not.toBeInTheDocument()
  })
})

describe('ScoreEntry — submission validation', () => {
  it('shows a toast and does not call onSubmit when a score is empty (rounds 1–6)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScoreEntry game={mockGame} roundNumber={2} onSubmit={onSubmit} isSubmitting={false} />)

    // Mark Alice as out, leave Bob's score empty
    await user.click(screen.getByText('Alice').closest('button')!)
    await user.click(screen.getByRole('button', { name: /Submit Round 2/i }))

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts empty scores on round 7 (defaults to 250) without an error toast', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScoreEntry game={mockGame} roundNumber={7} onSubmit={onSubmit} isSubmitting={false} />)

    // Mark Alice as out, leave Bob's score empty
    await user.click(screen.getByText('Alice').closest('button')!)
    await user.click(screen.getByRole('button', { name: /Submit Round 7/i }))

    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'p2', points: 250 }),
      ]),
    )
  })

  it('passes correct scores to onSubmit including wentOut flags', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={onSubmit} isSubmitting={false} />)

    // Mark Alice as out
    await user.click(screen.getByText('Alice').closest('button')!)
    // Enter Bob's score
    const bobInput = screen.getByPlaceholderText('0')
    await user.clear(bobInput)
    await user.type(bobInput, '25')
    await user.click(screen.getByRole('button', { name: /Submit Round 1/i }))

    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ playerId: 'p1', wentOut: true, wentOutInOneGo: false }),
      expect.objectContaining({ playerId: 'p2', points: 25, wentOut: false }),
    ])
  })
})

describe('ScoreEntry — round 7 placeholder', () => {
  it('shows placeholder "250" on score inputs for round 7', () => {
    render(<ScoreEntry game={mockGame} roundNumber={7} onSubmit={vi.fn()} isSubmitting={false} />)
    const inputs = screen.getAllByPlaceholderText('250')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('shows placeholder "0" on score inputs for round 1', () => {
    render(<ScoreEntry game={mockGame} roundNumber={1} onSubmit={vi.fn()} isSubmitting={false} />)
    const inputs = screen.getAllByPlaceholderText('0')
    expect(inputs.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/frontend && npm test
```

Expected: all ScoreEntry tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/Game.tsx packages/frontend/src/pages/__tests__/Game.ScoreEntry.test.tsx
git commit -m "fix(frontend): empty score fields now correctly fail validation on rounds 1-6

Also adds ScoreEntry component tests covering toggle, validation, and round 7 behavior."
```

---

## Task 12: Frontend — SeasonDetail standings toggle tests

**Files:**
- Create: `packages/frontend/src/pages/__tests__/SeasonDetail.standings.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/wrapper'
import SeasonDetail from '../SeasonDetail'
import { Routes, Route } from 'react-router-dom'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  }
})
import { api } from '@/lib/api'

vi.mock('@/hooks/useToast', () => ({ toast: vi.fn() }))

const mockSeason = {
  id: 's1',
  name: 'Spring 2026',
  status: 'ACTIVE',
  groupId: 'g1',
  createdAt: '2026-01-01',
  _count: { games: 2, players: 3 },
}

// Alice: most wins (2), highest points (89)
// Bob:   1 win, 67 pts
// Carol: 0 wins, 45 pts  ← lowest points (wins the points ranking)
const mockStandings = [
  { playerId: 'p1', playerName: 'Alice', playerAvatar: 'cat', totalPoints: 89, gamesPlayed: 2, wins: 2 },
  { playerId: 'p2', playerName: 'Bob',   playerAvatar: 'fox', totalPoints: 67, gamesPlayed: 2, wins: 1 },
  { playerId: 'p3', playerName: 'Carol', playerAvatar: 'bear', totalPoints: 45, gamesPlayed: 2, wins: 0 },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/seasons') return [mockSeason]
    if (path === '/seasons/s1/standings') return mockStandings
    if (path === '/seasons/s1/games') return []
    return []
  })
})

function renderSeasonDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/seasons/:id" element={<SeasonDetail />} />
    </Routes>,
    { initialEntries: ['/seasons/s1'] },
  )
}

describe('SeasonDetail — standings toggle', () => {
  it('shows players sorted by points ascending by default (Carol first)', async () => {
    renderSeasonDetail()

    // Wait for standings to render
    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument())

    const rows = screen.getAllByText(/Alice|Bob|Carol/)
    // Carol (45 pts) first, then Bob (67 pts), then Alice (89 pts)
    expect(rows[0].textContent).toContain('Carol')
    expect(rows[1].textContent).toContain('Bob')
    expect(rows[2].textContent).toContain('Alice')
  })

  it('re-sorts by wins descending when "Wins" button is clicked (Alice first)', async () => {
    const user = userEvent.setup()
    renderSeasonDetail()

    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Wins/i }))

    const rows = screen.getAllByText(/Alice|Bob|Carol/)
    // Alice (2 wins) first, then Bob (1 win), then Carol (0 wins)
    expect(rows[0].textContent).toContain('Alice')
    expect(rows[1].textContent).toContain('Bob')
    expect(rows[2].textContent).toContain('Carol')
  })

  it('restores points order when "Points" button is clicked after switching to wins', async () => {
    const user = userEvent.setup()
    renderSeasonDetail()

    await waitFor(() => expect(screen.getByText('Carol')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Wins/i }))
    await user.click(screen.getByRole('button', { name: /Points/i }))

    const rows = screen.getAllByText(/Alice|Bob|Carol/)
    expect(rows[0].textContent).toContain('Carol')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/frontend && npm test
```

Expected: all frontend tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/__tests__/SeasonDetail.standings.test.tsx
git commit -m "test(frontend): SeasonDetail standings toggle tests"
```

---

## Task 13: Root npm scripts and final verification

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add test scripts to root `package.json`**

`concurrently` is already in the root devDependencies (`^8.2.2`). Add to the `"scripts"` object:
```json
"test":          "npm run test -w packages/backend && npm run test -w packages/frontend",
"test:watch":    "concurrently \"npm run test:watch -w packages/backend\" \"npm run test:watch -w packages/frontend\"",
"test:coverage": "npm run test:coverage -w packages/backend && npm run test:coverage -w packages/frontend"
```

- [ ] **Step 2: Run the full test suite from the root**

```bash
cd /Users/andresbenito/Documents/claude/continental && npm test 2>&1 | tail -20
```

Expected: all ~53 tests pass across both packages, 0 failures.

- [ ] **Step 3: Confirm the build still passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean build with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test: add root npm test scripts, wire up full test suite"
```

---

## Troubleshooting Notes

**"Cannot find module '../../lib/prisma.js'"** — Vitest resolves `.js` extensions to `.ts` files in the same directory. The `__mocks__` folder must be at `src/lib/__mocks__/prisma.ts` (adjacent to `prisma.ts`), not at `src/__mocks__/`.

**"vi.mock() not hoisted"** — `vi.mock(...)` calls must be at the top level of the test file (not inside `describe` or `beforeEach`). Vitest hoists them automatically.

**React Query not fetching in tests** — Ensure the `QueryClient` is created fresh per test (inside `makeWrapper()` or `renderWithProviders`) with `retry: false`. Shared clients leak state between tests.

**`useNavigate` throws outside Router** — Always wrap hooks that call `useNavigate` in a `MemoryRouter`. The `makeWrapper()` helper in `useAuth.test.tsx` does this.

**Tailwind/CSS class errors in jsdom** — jsdom doesn't process Tailwind classes. This is expected. Tests assert on text content, roles, and data — not CSS classes.
