# Test Suite Design — Continental Scorekeeper

**Date:** 2026-03-21
**Goal:** Deploy confidence + living documentation
**Scope:** Backend (unit + route) and Frontend (component + logic)

---

## 1. Framework

**Vitest everywhere.** Both packages are ESM (`type: "module"`); Vitest is ESM-native and avoids the transform friction of Jest. The frontend shares the existing Vite config. The API is Jest-compatible so tests read naturally as documentation.

| Package | Runner | Environment | Component layer |
|---|---|---|---|
| `packages/backend` | Vitest | `node` | Fastify `inject()` |
| `packages/frontend` | Vitest | `jsdom` | React Testing Library |

---

## 2. Backend Setup

### Dependencies (devDependencies)
- `vitest`
- `@vitest/coverage-v8` (required for `vitest run --coverage`)

### Config — `packages/backend/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

### Prisma mock
A shared mock at `src/__mocks__/prisma.ts` using `vi.fn()` for every method used in routes. Each test file calls `vi.mock('../lib/prisma.js')` and overrides return values per test with `vi.mocked(prisma.model.method).mockResolvedValueOnce(...)`.

### Route testing pattern
Routes are tested by building the Fastify app (without starting a real HTTP server) and using `app.inject()`. All route URLs include the `/api` prefix (e.g. `/api/auth/login`, `/api/admin/groups`) since that is how they are registered in the app.

```ts
const response = await app.inject({
  method: 'POST',
  url: '/api/games/:gameId/rounds',
  payload: {...},
  cookies: { token: validJwt },
})
expect(response.statusCode).toBe(201)
```

A `buildApp()` test helper registers all plugins and routes so tests stay DRY.

### Test file locations
```
packages/backend/src/
  lib/__tests__/
    gameRules.test.ts
  routes/__tests__/
    auth.test.ts
    admin.test.ts
    rounds.test.ts
    seasons.test.ts
```

---

## 3. Backend Test Coverage

### `lib/gameRules.ts`
- `getRoundInfo(n)` returns correct `cardsDealt` and `description` for rounds 1–7
- `getRoundInfo(1).cardsDealt === 7` (round 1 deals 7 cards)
- `getRoundInfo(7).cardsDealt === 13` (round 7 deals 13 cards)
- Returns `undefined` for round 0 and round 8

### `routes/rounds.ts` — POST `/api/games/:gameId/rounds`
- Player who `wentOut: true, wentOutInOneGo: false` gets `points: 0` stored in DB
- Player who `wentOutInOneGo: true` on round 1 gets `points: -10` stored
- Player who `wentOutInOneGo: true` on round 7 gets `points: -70` stored
  - _(Note: `wentOutInOneGo` itself is not persisted — only the computed `points` value is. Tests assert the `points` field on the created `RoundScore`.)_
- Rejects with 409 if round already submitted
- Rejects with 400 if a game player is missing from scores payload
- Rejects with 400 if two players both have `wentOut: true`
- Rejects with 400 if a non-wentOut player submits negative points (Zod `.int()` without `.min()` allows it — test documents the current permissive behaviour or tightens the schema)
- Requires authentication — returns 401 without cookie

### `routes/rounds.ts` — PATCH `/api/rounds/:id`
- Correctly recomputes points when a round is edited (same one-go logic as POST)
- Rejects with 403 if game is already CLOSED
- Rejects with 400 if two players both have `wentOut: true`

### `routes/auth.ts`
- POST `/api/auth/login`: returns `Set-Cookie` header on valid credentials
- POST `/api/auth/login`: returns 401 on wrong password
- POST `/api/auth/logout`: clears the auth cookie
- GET `/api/auth/me`: returns role + groupName when authenticated
- GET `/api/auth/me`: returns 401 without cookie

### `routes/seasons.ts` — GET `/api/seasons/:id/standings`
- Standings sorted by lowest total points ascending
- Win assigned to player with lowest score in a game
- Tie in game score → both players credited with a win
- Season with no closed games returns empty array
- Season belonging to a different group returns 404

### `routes/admin.ts`
- POST `/api/admin/groups`: rejects username shorter than 3 chars
- POST `/api/admin/groups`: rejects password shorter than 6 chars
- POST `/api/admin/groups`: creates group and returns 201
- DELETE `/api/admin/groups/:id`: returns 204
- Any admin route called with a non-admin JWT returns 403

---

## 4. Frontend Setup

### Dependencies (devDependencies)
- `vitest`
- `@testing-library/react`
- `@testing-library/user-event`
- `@testing-library/jest-dom`
- `jsdom`

### Config — `packages/frontend/vitest.config.ts`
```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    server: {},  // override merged Vite proxy — not needed in test environment
  },
}))
```
> **Note:** `mergeConfig` inherits Vite's `server.proxy` block. The explicit `server: {}` override prevents any proxy or server plugin from leaking into the jsdom test environment.

### Setup file — `src/test/setup.ts`
- Imports `@testing-library/jest-dom` matchers
- Configures a global `fetch` mock that tests override per-test

### React Query test wrapper — `src/test/wrapper.tsx`
A `renderWithProviders()` helper wrapping `QueryClientProvider` (fresh client per test) + `MemoryRouter`, used as the `wrapper` option in RTL's `render()`.

### Test file locations
```
packages/frontend/src/
  lib/__tests__/
    api.test.ts
    utils.test.ts
  hooks/__tests__/
    useAuth.test.ts
  pages/__tests__/
    Game.ScoreEntry.test.tsx
    SeasonDetail.standings.test.tsx
```

---

## 5. Frontend Test Coverage

### `lib/api.ts`
- `fieldErrors` from a Zod validation response are extracted and joined into the thrown error message
- When no `fieldErrors` present, falls back to `error.error` field
- Request does NOT include `Content-Type` header when no body is passed
- Request includes `Content-Type: application/json` when body is present

### `lib/utils.ts`
- `ROUNDS_INFO` has exactly 7 entries
- `ROUNDS_INFO[0].cardsDealt === 7` (round 1) and `ROUNDS_INFO[6].cardsDealt === 13` (round 7)
- `AVATAR_EMOJIS` returns a string for known keys

### `pages/Game.tsx` — ScoreEntry component
Rendered with a minimal `game` fixture (2 players, round N).

- All players are rendered
- Tapping a player once shows "OUT 🏆" label and disables score input (shows 0)
- Tapping same player a second time shows "ONE GO ⚡" label and shows negative score
- Tapping same player a third time deselects (score input returns)
- Submitting with an empty score field for a non-wentOut player on rounds 1–6 shows error toast and does not call `onSubmit`
  - _(On round 7, empty fields default to 250 and are accepted — tested as a separate case)_
- On round 7: submitting with an empty score for a non-wentOut player succeeds (defaults to 250), does not show error toast
- On round 7, empty score inputs show placeholder "250"
- After `onSubmit` is called, the form resets (verified by testing parent `GamePage` renders a fresh `ScoreEntry` for the next round due to `key={nextRound}`)

### `pages/SeasonDetail.tsx` — standings toggle
Rendered with a mock standings array (3 players, mixed wins/points).

- Default view shows players sorted by points ascending
- Primary stat shown is total points; secondary stat is wins
- Clicking "Wins" button re-sorts players by wins descending
- After toggling to Wins, primary stat shown is wins; secondary stat is points
- Clicking "Points" button restores points-ascending order

### `hooks/useAuth.ts`
- Logout: when API call **succeeds**, query cache is cleared and router navigates to `/login`
- Logout: when API call **fails**, query cache is still cleared and router still navigates to `/login`
- Login: when API returns a user with `role: 'admin'`, navigates to `/admin`
- Login: when API returns a user with `role: 'group'`, navigates to `/dashboard`

---

## 6. NPM Scripts

**Root `package.json`** additions:
```json
"test":          "npm run test -w packages/backend && npm run test -w packages/frontend",
"test:watch":    "concurrently \"npm run test:watch -w packages/backend\" \"npm run test:watch -w packages/frontend\"",
"test:coverage": "npm run test:coverage -w packages/backend && npm run test:coverage -w packages/frontend"
```

**Each package `package.json`** additions:
```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

---

## 7. What Is Not Tested

- **Telegram bot** (`packages/bot`) — out of scope
- **Prisma migrations** — schema correctness is the DB's job
- **Recharts rendering** — third-party library, visual regression not worth the noise
- **Full e2e flows** — Playwright is installed but not wired up; deferred to a future spec
- **`GET /api/seasons/:id/games`, `POST /api/seasons`, `POST /api/games`** — basic CRUD; auth is covered, no complex logic to document

---

## 8. File Count Summary

| Location | Files | Tests |
|---|---|---|
| `backend/lib/__tests__/` | 1 | ~4 |
| `backend/routes/__tests__/` | 4 | ~25 |
| `frontend/lib/__tests__/` | 2 | ~7 |
| `frontend/hooks/__tests__/` | 1 | ~4 |
| `frontend/pages/__tests__/` | 2 | ~13 |
| **Total** | **10** | **~53** |
