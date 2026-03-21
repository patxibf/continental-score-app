# CLAUDE.md — Continental Scorekeeper

Project context and conventions for AI assistants working on this codebase.

## What This Is

Full-stack TypeScript monorepo: a scorekeeper for the Spanish card game Continental. Groups register, create seasons, play games (7 rounds each), and track standings.

## Dev Environment

```bash
docker-compose up -d    # start Postgres on port 5433
npm run dev             # backend :3001 + frontend :5173
npm test                # run all tests (always before committing)
```

**Critical**: This machine has another Postgres instance on port 5432 (`rugby_club_db`). Continental's DB maps to **5433**. Both `.env` files already exist with correct `DATABASE_URL=...localhost:5433/...`.

Admin credentials (local): `username=admin`, `password=pass`

## Key Rules & Constraints

- A game has exactly **7 rounds** (`TOTAL_ROUNDS = 7` in `packages/backend/src/lib/gameRules.ts`)
- A game **cannot be closed** until all 7 rounds are complete (enforced in `POST /api/games/:id/close`)
- The "Close Game" button is hidden on the frontend until all 7 rounds are played (`isGameComplete` in `Game.tsx`)
- Multiple games can be `IN_PROGRESS` simultaneously in the same season
- Scores: lowest points wins; one-go earns `-(roundNumber × 10)`; round 7 empty fields default to 250

## Backend Patterns

**Test setup** — `packages/backend/src/test/helpers.ts`:
```typescript
const app = await buildApp()      // registers all routes + auth plugins
const token = groupToken(app)     // group admin JWT
const token = memberToken(app)    // read-only member JWT
const token = adminToken(app)     // platform admin JWT
```

**Prisma mock** — `packages/backend/src/lib/__mocks__/prisma.ts`:
Manual `vi.fn()` mock for every model method used in tests. If you add a new route that calls `prisma.someModel.someMethod()`, add the corresponding mock there.

**Route tests** use `app.inject()` with `cookie: \`token=${token}\`` headers.

**Auth guards**:
- `requireGroup` — any logged-in group user (member or admin)
- `requireGroupAdmin` — group with `groupAccess: 'admin'`
- `requireAdmin` — platform admin role

## Frontend Patterns

**Test wrapper** — `packages/frontend/src/test/wrapper.tsx`:
```typescript
renderWithProviders(<MyComponent />, { initialEntries: ['/some-path'] })
```
Wraps with `QueryClientProvider` (fresh client per test) + `MemoryRouter`.

**API mock**:
```typescript
vi.mock('@/lib/api')
const mockApi = api as jest.Mocked<typeof api>
mockApi.get.mockResolvedValue(someData)
```

**API client** — `packages/frontend/src/lib/api.ts`:
Typed fetch wrapper. All calls use `api.get/post/patch/delete`. Types are exported from this file.

**Key pages**: `Dashboard.tsx` (live game banners), `Game.tsx` (round score entry + close button logic), `SeasonDetail.tsx` (standings).

## File Map

| Concern | File |
|---------|------|
| Game rules constants | `packages/backend/src/lib/gameRules.ts` |
| Prisma schema | `packages/backend/prisma/schema.prisma` |
| Prisma mock | `packages/backend/src/lib/__mocks__/prisma.ts` |
| Test helpers | `packages/backend/src/test/helpers.ts` |
| Frontend API types | `packages/frontend/src/lib/api.ts` |
| Test wrapper | `packages/frontend/src/test/wrapper.tsx` |
| Auth plugin | `packages/backend/src/plugins/auth.ts` |

## Testing Philosophy

- TDD: write failing tests first, then implement
- Backend tests: mock Prisma, test routes via `app.inject()`
- Frontend tests: mock `api`, test rendered output with RTL
- Never hit a real DB in tests
- Run `npm test` before every commit — 0 failures required

## Commit Style

```
feat: add round enforcement to game close endpoint
fix: hide close button until all 7 rounds complete
test: add dashboard live games rendering tests
```
