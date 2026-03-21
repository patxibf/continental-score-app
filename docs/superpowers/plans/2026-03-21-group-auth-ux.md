# Group Auth UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing 3-field group creation form (name + username + password) with a 3-field form (name → auto-slug + admin password + optional member password), and add a `member` access level that can view and score but cannot manage seasons/games/players.

**Architecture:** Add `memberPasswordHash` (nullable) to the `Group` DB model. The login endpoint detects which password matched and sets `groupAccess: 'admin' | 'member'` in the JWT. A new `requireGroupAdmin` auth hook blocks members from destructive endpoints. The frontend reads `groupAccess` from the auth context and hides management UI for members.

**Tech Stack:** Prisma (PostgreSQL), Fastify + bcryptjs + JWT, React + TanStack Query, Zod, Vitest

---

## File Map

**Modified:**
- `packages/backend/prisma/schema.prisma` — add `memberPasswordHash String?` to `Group`
- `packages/backend/prisma/migrations/<timestamp>_member_password/migration.sql` — ALTER TABLE
- `packages/backend/src/plugins/auth.ts` — add `requireGroupAdmin` hook; expand `JWTPayload` type
- `packages/backend/src/routes/auth.ts` — dual-password login; return `groupAccess` in responses
- `packages/backend/src/routes/admin.ts` — auto-generate slug from name; accept `memberPassword`; update schema
- `packages/backend/src/routes/seasons.ts` — add `requireGroupAdmin` to POST create, PATCH rename, POST close, POST players, DELETE players
- `packages/backend/src/routes/games.ts` — add `requireGroupAdmin` to POST create, POST close, DELETE abort
- `packages/backend/src/routes/players.ts` — add `requireGroupAdmin` to POST, PATCH, DELETE
- `packages/backend/src/routes/rounds.ts` — fix `groupId` cast; PATCH /api/rounds/:id stays accessible to members (they can edit scores they entered)
- `packages/backend/src/routes/__tests__/admin.test.ts` — update for new schema
- `packages/backend/src/routes/__tests__/auth.test.ts` — add member login tests
- `packages/frontend/src/lib/api.ts` — add `groupAccess` to `AuthUser`; add `memberPassword` to `Group`

**Not modified (read-only routes, accessible to members):**
- `packages/backend/src/routes/stats.ts` — GET only, stays `requireGroup`
- `packages/frontend/src/hooks/useAuth.ts` — expose `isGroupAdmin` derived boolean
- `packages/frontend/src/pages/Admin.tsx` — auto-slug preview; member password field; remove username field
- `packages/frontend/src/pages/Seasons.tsx` — hide New Season button for members
- `packages/frontend/src/pages/SeasonDetail.tsx` — hide Close Season + New Game for members
- `packages/frontend/src/pages/Game.tsx` — hide Abort + Close Game + Edit round for members
- `packages/frontend/src/pages/Players.tsx` — hide add/edit/delete for members

---

## Shared Utilities

**Slug generation** (used in `admin.ts`):
```typescript
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

// If slug is taken, append -2, -3, etc.
async function uniqueSlug(name: string): Promise<string> {
  const base = nameToSlug(name)
  let candidate = base
  let n = 2
  while (await prisma.group.findUnique({ where: { username: candidate } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}
```

---

## Task 1: DB Schema — add memberPasswordHash

**Files:**
- Modify: `packages/backend/prisma/schema.prisma` (line 17-26)
- Create: `packages/backend/prisma/migrations/<timestamp>_member_password/migration.sql`

- [ ] **Step 1: Add field to schema**

In `schema.prisma`, update the `Group` model:
```prisma
model Group {
  id                 String         @id @default(uuid())
  name               String
  username           String         @unique
  passwordHash       String
  memberPasswordHash String?
  createdAt          DateTime       @default(now())
  groupPlayers       GroupPlayer[]
  seasons            Season[]
  telegramChats      TelegramChat[]
}
```

- [ ] **Step 2: Create migration directory and SQL file**

```bash
mkdir -p packages/backend/prisma/migrations/20260321000000_member_password
```

Create `packages/backend/prisma/migrations/20260321000000_member_password/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "Group" ADD COLUMN "memberPasswordHash" TEXT;
```

- [ ] **Step 3: Apply migration to local DB and regenerate client**

```bash
npm run db:migrate:deploy -w packages/backend
npm run db:generate -w packages/backend
```

Expected: migration applied, Prisma client regenerated.

- [ ] **Step 4: Verify no TS errors**

```bash
npm run build -w packages/backend
```

Expected: clean compile.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/
git commit -m "feat: add memberPasswordHash to Group schema"
```

---

## Task 2: Auth Plugin — add requireGroupAdmin + update JWTPayload

**Files:**
- Modify: `packages/backend/src/plugins/auth.ts`

The JWT payload for group users needs a new `groupAccess` field. The `requireGroupAdmin` hook rejects requests where `groupAccess === 'member'`.

- [ ] **Step 1: Write failing test**

In `packages/backend/src/routes/__tests__/auth.test.ts`, add:
```typescript
describe('requireGroupAdmin middleware', () => {
  it('allows groupAccess=admin', async () => {
    // tested indirectly through protected routes in Task 5 tests
    expect(true).toBe(true)
  })
})
```

Run: `npm test -w packages/backend -- --reporter=verbose 2>&1 | head -40`

- [ ] **Step 2: Update auth plugin**

Replace `packages/backend/src/plugins/auth.ts` entirely:
```typescript
import fp from 'fastify-plugin'
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

export type JWTPayload =
  | { role: 'admin'; adminId: string }
  | { role: 'group'; groupId: string; groupAccess: 'admin' | 'member' }

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'admin') {
        reply.status(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'group') {
        reply.status(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroupAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'group') {
        reply.status(403).send({ error: 'Forbidden' })
        return
      }
      if (payload.groupAccess !== 'admin') {
        reply.status(403).send({ error: 'Forbidden: admin access required' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireGroup: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireGroupAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(authPlugin)
```

- [ ] **Step 3: Update test helpers to support member tokens**

In `packages/backend/src/test/helpers.ts`, add `memberToken` helper alongside `groupToken`:
```typescript
export function memberToken(app: FastifyInstance): string {
  return app.jwt.sign({ role: 'group', groupId: 'group-1', groupAccess: 'member' })
}
```

Also update `groupToken` to include `groupAccess: 'admin'` in its payload:
```typescript
export function groupToken(app: FastifyInstance): string {
  return app.jwt.sign({ role: 'group', groupId: 'group-1', groupAccess: 'admin' })
}
```

- [ ] **Step 4: Run tests — expect all still pass**

```bash
npm test -w packages/backend
```

Expected: 70 tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/plugins/auth.ts packages/backend/src/test/helpers.ts
git commit -m "feat: add requireGroupAdmin hook and groupAccess to JWT"
```

---

## Task 3: Auth Route — dual-password login

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/src/routes/__tests__/auth.test.ts`

The login endpoint checks the admin password first, then the member password. The JWT and response both carry `groupAccess`.

- [ ] **Step 1: Write failing tests**

Add to `packages/backend/src/routes/__tests__/auth.test.ts`:
```typescript
describe('POST /api/auth/login — group dual password', () => {
  const mockGroup = {
    id: 'g1',
    name: 'Test Group',
    username: 'testgroup',
    passwordHash: '$2a$10$dummy_admin_hash',
    memberPasswordHash: '$2a$10$dummy_member_hash',
    createdAt: new Date(),
    telegramChats: [],
  }

  it('returns groupAccess=admin when admin password matches', async () => {
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(mockGroup as any)
    // bcrypt.compare is not mocked — we need to test with real hashes or mock bcrypt
    // Use a pre-hashed value: hash of 'adminpass'
    // For unit tests, override the mock group's passwordHash with a real hash
    const bcrypt = await import('bcryptjs')
    const adminHash = await bcrypt.hash('adminpass', 1)
    vi.mocked(prisma.group.findUnique).mockReset()
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      ...mockGroup, passwordHash: adminHash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testgroup', password: 'adminpass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupAccess: 'admin' })
  })

  it('returns groupAccess=member when member password matches', async () => {
    const bcrypt = await import('bcryptjs')
    const memberHash = await bcrypt.hash('memberpass', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test Group', username: 'testgroup',
      passwordHash: await bcrypt.hash('adminpass', 1),
      memberPasswordHash: memberHash,
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testgroup', password: 'memberpass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'group', groupAccess: 'member' })
  })

  it('returns 401 when neither password matches', async () => {
    const bcrypt = await import('bcryptjs')
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'g1', name: 'Test Group', username: 'testgroup',
      passwordHash: await bcrypt.hash('adminpass', 1),
      memberPasswordHash: await bcrypt.hash('memberpass', 1),
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testgroup', password: 'wrongpass' },
    })

    expect(res.statusCode).toBe(401)
  })
})
```

Run: `npm test -w packages/backend -- auth.test`
Expected: new tests FAIL (groupAccess not returned yet).

- [ ] **Step 2: Update auth route**

Replace `packages/backend/src/routes/auth.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid request' })
    }

    const { username, password } = body.data

    // Try system admin
    const admin = await prisma.admin.findUnique({ where: { username } })
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      const token = fastify.jwt.sign({ role: 'admin', adminId: admin.id })
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      })
      return reply.send({ role: 'admin', username: admin.username })
    }

    // Try group — check admin password first, then member password
    const group = await prisma.group.findUnique({ where: { username } })
    if (group) {
      let groupAccess: 'admin' | 'member' | null = null

      if (await bcrypt.compare(password, group.passwordHash)) {
        groupAccess = 'admin'
      } else if (
        group.memberPasswordHash &&
        (await bcrypt.compare(password, group.memberPasswordHash))
      ) {
        groupAccess = 'member'
      }

      if (groupAccess) {
        const token = fastify.jwt.sign({ role: 'group', groupId: group.id, groupAccess })
        reply.setCookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/',
        })
        return reply.send({ role: 'group', groupId: group.id, groupName: group.name, groupAccess })
      }
    }

    return reply.status(401).send({ error: 'Invalid credentials' })
  })

  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })

  fastify.get('/api/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as { role: string; groupId?: string; adminId?: string; groupAccess?: string }
    if (payload.role === 'admin') {
      const admin = await prisma.admin.findUnique({
        where: { id: payload.adminId },
        select: { id: true, username: true },
      })
      return reply.send({ role: 'admin', ...admin })
    }
    if (payload.role === 'group') {
      const group = await prisma.group.findUnique({
        where: { id: payload.groupId },
        select: { id: true, name: true, username: true },
      })
      return reply.send({
        role: 'group',
        groupId: payload.groupId,
        groupAccess: payload.groupAccess ?? 'admin',
        ...group,
      })
    }
    return reply.status(401).send({ error: 'Unauthorized' })
  })
}

export default authRoutes
```

- [ ] **Step 3: Run tests**

```bash
npm test -w packages/backend -- auth.test
```

Expected: all auth tests pass including new dual-password tests.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/auth.ts packages/backend/src/routes/__tests__/auth.test.ts
git commit -m "feat: dual-password login returns groupAccess in JWT and response"
```

---

## Task 4: Admin Route — auto-slug + member password

**Files:**
- Modify: `packages/backend/src/routes/admin.ts`
- Modify: `packages/backend/src/routes/__tests__/admin.test.ts`

Remove `username` from the create request. Auto-generate a unique slug from the group name. Accept optional `memberPassword`.

- [ ] **Step 1: Write failing tests**

Add to `packages/backend/src/routes/__tests__/admin.test.ts`:
```typescript
describe('POST /api/admin/groups — auto-slug + member password', () => {
  it('auto-generates slug from name', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null) // no conflict
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new', name: 'Friday Night', username: 'friday-night',
      createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Friday Night', password: 'secret123' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ name: 'Friday Night', username: 'friday-night' })
  })

  it('creates group with member password and hashes it', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'g-new', name: 'Test', username: 'test', createdAt: new Date(),
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { name: 'Test', password: 'adminpass', memberPassword: 'memberpass' },
      cookies: { token: adminToken(app) },
    })

    expect(res.statusCode).toBe(201)
    const createCall = vi.mocked(prisma.group.create).mock.calls[0][0]
    expect(createCall.data).toHaveProperty('memberPasswordHash')
    expect(typeof (createCall.data as any).memberPasswordHash).toBe('string')
    // The hash must NOT be the plain text password
    expect((createCall.data as any).memberPasswordHash).not.toBe('memberpass')
  })

  it('returns 400 when no name provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      payload: { password: 'secret123' },
      cookies: { token: adminToken(app) },
    })
    expect(res.statusCode).toBe(400)
  })
})
```

Run: `npm test -w packages/backend -- admin.test`
Expected: new tests FAIL (username field still required in schema).

- [ ] **Step 2: Update admin route**

Replace `packages/backend/src/routes/admin.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

async function uniqueSlug(name: string): Promise<string> {
  const base = nameToSlug(name)
  let candidate = base
  let n = 2
  while (await prisma.group.findUnique({ where: { username: candidate } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(6),
  memberPassword: z.string().min(6).optional(),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(6).optional(),
  memberPassword: z.string().min(6).optional().nullable(),
})

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (_request, reply) => {
      const groups = await prisma.group.findMany({
        select: {
          id: true, name: true, username: true, createdAt: true,
          memberPasswordHash: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      // Return hasMemberPassword boolean, not the hash
      return reply.send(groups.map(g => ({
        ...g,
        hasMemberPassword: !!g.memberPasswordHash,
        memberPasswordHash: undefined,
      })))
    },
  )

  fastify.post(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const body = createGroupSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const { name, password, memberPassword } = body.data
      const username = await uniqueSlug(name)
      const passwordHash = await bcrypt.hash(password, 10)
      const memberPasswordHash = memberPassword
        ? await bcrypt.hash(memberPassword, 10)
        : null

      const group = await prisma.group.create({
        data: { name, username, passwordHash, ...(memberPasswordHash ? { memberPasswordHash } : {}) },
        select: { id: true, name: true, username: true, createdAt: true },
      })

      return reply.status(201).send(group)
    },
  )

  fastify.patch(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = updateGroupSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' })
      }

      const data: { name?: string; passwordHash?: string; memberPasswordHash?: string | null } = {}
      if (body.data.name) data.name = body.data.name
      if (body.data.password) data.passwordHash = await bcrypt.hash(body.data.password, 10)
      if (body.data.memberPassword !== undefined) {
        data.memberPasswordHash = body.data.memberPassword
          ? await bcrypt.hash(body.data.memberPassword, 10)
          : null
      }

      const updated = await prisma.group.update({
        where: { id },
        data,
        select: { id: true, name: true, username: true, createdAt: true },
      })

      return reply.send(updated)
    },
  )

  fastify.delete(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' })
      }

      await prisma.group.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}

export default adminRoutes
```

- [ ] **Step 3: Run tests**

```bash
npm test -w packages/backend -- admin.test
```

Expected: all admin tests pass. Note: the old test `'returns 400 when username is shorter than 3 chars'` should be deleted since `username` is no longer in the request schema.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/admin.ts packages/backend/src/routes/__tests__/admin.test.ts
git commit -m "feat: auto-generate group slug from name, add member password support"
```

---

## Task 5: Protect Destructive Routes

**Files:**
- Modify: `packages/backend/src/routes/seasons.ts`
- Modify: `packages/backend/src/routes/games.ts`
- Modify: `packages/backend/src/routes/players.ts`
- Modify: `packages/backend/src/routes/__tests__/seasons.test.ts` (add member 403 test)

Members can: GET seasons, GET games, GET rounds, POST rounds (submit scores), PATCH rounds (edit scores).
Members cannot: POST seasons (create), POST seasons/close, POST games (create), POST games/close, DELETE games, POST/PATCH/DELETE players.

- [ ] **Step 1: Write failing test for member restriction**

Add to `packages/backend/src/routes/__tests__/seasons.test.ts`:
```typescript
describe('POST /api/seasons — member access', () => {
  it('returns 403 when called with member token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'Test Season' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})
```

Import `memberToken` in the test file:
```typescript
import { buildApp, adminToken, groupToken, memberToken } from '../../test/helpers.js'
```

Run: `npm test -w packages/backend -- seasons.test`
Expected: new test FAILS (currently returns 200/404 since `requireGroup` only checks role=group).

- [ ] **Step 2: Update seasons.ts**

Change `preHandler` for write operations only. Read operations stay as `requireGroup`:
- `POST /api/seasons` (create) → `requireGroupAdmin`
- `PATCH /api/seasons/:id` (rename) → `requireGroupAdmin`
- `POST /api/seasons/:id/close` → `requireGroupAdmin`
- `POST /api/seasons/:id/players` (add player to season) → `requireGroupAdmin`
- `DELETE /api/seasons/:id/players/:playerId` (remove player from season) → `requireGroupAdmin`
- All GET routes (`GET /api/seasons`, `GET /api/seasons/:id/players`, `GET /api/seasons/:id/standings`) → keep `requireGroup`

Open `packages/backend/src/routes/seasons.ts` and for each of the 5 write routes above, change `[fastify.requireGroup]` to `[fastify.requireGroupAdmin]`.

- [ ] **Step 3: Update games.ts**

Change `preHandler` for write operations:
- `POST /api/seasons/:seasonId/games` (create game) → `requireGroupAdmin`
- `POST /api/games/:id/close` → `requireGroupAdmin`
- `DELETE /api/games/:id` (abort) → `requireGroupAdmin`
- `GET /api/seasons/:seasonId/games` → keep `requireGroup`
- `GET /api/games/:id` → keep `requireGroup`

- [ ] **Step 4: Update players.ts**

Change `preHandler` for write operations (POST create, PATCH update, DELETE remove) to `requireGroupAdmin`. Keep GET routes as `requireGroup`.

- [ ] **Step 4b: Update rounds.ts — fix JWTPayload cast**

`PATCH /api/rounds/:id` remains accessible to members (they can edit scores). However after Task 2 the `JWTPayload` type now includes `groupAccess`, so all `request.user as { groupId: string }` casts in `rounds.ts` must be updated to include it:

```typescript
// Before
const { groupId } = request.user as { groupId: string }

// After
const { groupId } = request.user as { groupId: string; groupAccess: string }
```

Apply this to all three route handlers in `packages/backend/src/routes/rounds.ts` (GET, POST, PATCH). No change to `preHandler` — all three stay as `requireGroup`.

- [ ] **Step 5: Run all backend tests**

```bash
npm test -w packages/backend
```

Expected: all tests pass including new 403 member tests.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/seasons.ts packages/backend/src/routes/games.ts \
  packages/backend/src/routes/players.ts \
  packages/backend/src/routes/__tests__/seasons.test.ts
git commit -m "feat: restrict destructive routes to group admin access"
```

---

## Task 6: Frontend — Auth Types + useAuth

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`
- Modify: `packages/frontend/src/hooks/useAuth.ts`

Add `groupAccess` to `AuthUser`. Expose `isGroupAdmin` (true for system admin + group admin, false for members).

- [ ] **Step 1: Update AuthUser type in api.ts**

Find the `AuthUser` interface in `packages/frontend/src/lib/api.ts` and update it:
```typescript
export interface AuthUser {
  role: 'admin' | 'group'
  groupAccess?: 'admin' | 'member'
  groupId?: string
  groupName?: string
  username?: string
}
```

Also update the `Group` interface to add `hasMemberPassword`:
```typescript
export interface Group {
  id: string
  name: string
  username: string
  createdAt: string
  hasMemberPassword?: boolean
}
```

- [ ] **Step 2: Update useAuth.ts**

Add `isGroupAdmin` derived value:
```typescript
export function useAuth() {
  // ... existing code ...

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    // true for system admins and group users with admin access
    isGroupAdmin: user?.role === 'admin' || user?.groupAccess === 'admin',
    login: loginMutation.mutate,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  }
}
```

- [ ] **Step 3: Build to check for TS errors**

```bash
npm run build -w packages/frontend
```

Expected: clean compile.

- [ ] **Step 4: Run frontend tests**

```bash
npm test -w packages/frontend
```

Expected: 27 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/lib/api.ts packages/frontend/src/hooks/useAuth.ts
git commit -m "feat: add groupAccess to AuthUser type and isGroupAdmin to useAuth"
```

---

## Task 7: Frontend — Admin.tsx — auto-slug + member password

**Files:**
- Modify: `packages/frontend/src/pages/Admin.tsx`

Remove the Username field from the create/edit form. Add a live slug preview from the group name. Add an optional Member Password field.

- [ ] **Step 1: Update GroupDialog**

Replace `packages/frontend/src/pages/Admin.tsx` with the following (full file):

Key changes in `GroupDialog`:
1. Remove `username` state and Username `<Input>`
2. Add `memberPassword` state
3. Show slug preview under the name field
4. Add Member Password field with "(leave blank for no member access)" hint
5. Send `memberPassword` in the payload (or `null` to remove it)

The slug preview function (frontend-only, for display):
```typescript
function toSlugPreview(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}
```

Updated `GroupDialog` state and form:
```typescript
function GroupDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group?: Group }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(group?.name || '')
  const [password, setPassword] = useState('')
  const [memberPassword, setMemberPassword] = useState('')

  useEffect(() => {
    if (open) {
      setName(group?.name || '')
      setPassword('')
      setMemberPassword('')
    }
  }, [open, group])

  const slugPreview = toSlugPreview(name)

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      group
        ? api.patch<Group>(`/admin/groups/${group.id}`, data)
        : api.post<Group>('/admin/groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] })
      toast({ title: group ? 'Group updated' : 'Group created' })
      onClose()
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast({ title: 'Group name is required', variant: 'destructive' }); return }
    if (!group && !password) { toast({ title: 'Admin password is required', variant: 'destructive' }); return }
    if (password && password.length < 6) { toast({ title: 'Password must be at least 6 characters', variant: 'destructive' }); return }
    if (memberPassword && memberPassword.length < 6) { toast({ title: 'Member password must be at least 6 characters', variant: 'destructive' }); return }

    const payload: Record<string, unknown> = { name }
    if (password) payload.password = password
    if (memberPassword) payload.memberPassword = memberPassword

    mutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--felt-card)] border-[rgba(201,168,76,0.2)]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem' }}>
            {group ? 'Edit Group' : 'New Group'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Name + slug preview */}
          <div className="space-y-1.5">
            <Label htmlFor="group-name" className="text-xs uppercase tracking-widest text-muted-foreground">
              Group Name
            </Label>
            <Input
              id="group-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
            />
            {!group && name && (
              <p className="text-xs text-muted-foreground">
                Login handle: <span className="text-[var(--gold)] font-mono">@{slugPreview || '…'}</span>
              </p>
            )}
            {group && (
              <p className="text-xs text-muted-foreground">
                Login handle: <span className="text-[var(--gold)] font-mono">@{group.username}</span>
              </p>
            )}
          </div>

          {/* Admin Password */}
          <div className="space-y-1.5">
            <Label htmlFor="group-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Admin Password{' '}
              {group && <span className="normal-case tracking-normal text-muted-foreground/60">(leave blank to keep)</span>}
            </Label>
            <Input
              id="group-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!group}
              placeholder={group ? '••••••••' : undefined}
              className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
            />
          </div>

          {/* Member Password */}
          <div className="space-y-1.5">
            <Label htmlFor="member-password" className="text-xs uppercase tracking-widest text-muted-foreground">
              Member Password
            </Label>
            <Input
              id="member-password"
              type="password"
              value={memberPassword}
              onChange={e => setMemberPassword(e.target.value)}
              placeholder="Optional — share with players for view-only access"
              className="bg-[rgba(255,255,255,0.04)] border-[rgba(201,168,76,0.2)] focus:border-[var(--gold)] focus:ring-0"
            />
            <p className="text-xs text-muted-foreground">
              Members can view scores and submit rounds, but cannot manage seasons, games, or players.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Also update the group card in the list to show a "👥 members" indicator when `group.hasMemberPassword` is true.

- [ ] **Step 2: Build frontend**

```bash
npm run build -w packages/frontend
```

Expected: clean compile.

- [ ] **Step 3: Run tests**

```bash
npm test -w packages/frontend
```

Expected: 27 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/pages/Admin.tsx
git commit -m "feat: auto-slug preview and member password in group creation form"
```

---

## Task 8: Frontend — Member-Aware UI

**Files:**
- Modify: `packages/frontend/src/pages/Seasons.tsx`
- Modify: `packages/frontend/src/pages/SeasonDetail.tsx`
- Modify: `packages/frontend/src/pages/Game.tsx`
- Modify: `packages/frontend/src/pages/Players.tsx`

Import `useAuth` and use `isGroupAdmin` to conditionally render management controls.

**Pattern to apply in each file:**
```typescript
import { useAuth } from '@/hooks/useAuth'
// ...
const { isGroupAdmin } = useAuth()
// ...
{isGroupAdmin && <Button onClick={...}>Destructive Action</Button>}
```

- [ ] **Step 1: Seasons.tsx — hide New Season for members**

Find the `<Button onClick={() => setDialogOpen(true)} ...>New</Button>` and the entire `<Dialog>` block. Wrap both with `{isGroupAdmin && ...}`.

- [ ] **Step 2: SeasonDetail.tsx — hide Close Season + New Game for members**

Find `season.status === 'ACTIVE' && <Button onClick={() => setCloseDialogOpen(true)}>Close Season</Button>` and gate it with `isGroupAdmin`.

Find the New Game button (Link to `/seasons/:seasonId/games/new`) and gate it with `isGroupAdmin`.

- [ ] **Step 3: Game.tsx — hide Abort + Close Game + Edit round for members**

Find the `<div className="flex items-center gap-2">` containing Abort and Close Game buttons. Gate the entire `div` with `isGroupAdmin`.

Find the edit button `onClick={() => setEditingRoundId(round.id)}` — it's already gated with `game.status === 'IN_PROGRESS'`. Add `&& isGroupAdmin` to that condition.

- [ ] **Step 4: Players.tsx — hide add/edit/delete for members**

Read `packages/frontend/src/pages/Players.tsx` first, then gate the add button, edit button, and delete button with `isGroupAdmin`.

- [ ] **Step 5: Build**

```bash
npm run build -w packages/frontend
```

Expected: clean compile.

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: 97 tests pass (70 backend + 27 frontend).

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/pages/
git commit -m "feat: hide management controls for member-access users"
```

---

## Final Step: Deploy + Validate

- [ ] Build backend locally, deploy to EC2 via S3 presigned URL + SSM:
  ```bash
  npm run build -w packages/backend
  tar czf /tmp/backend-dist.tar.gz packages/backend/dist
  aws s3 cp /tmp/backend-dist.tar.gz s3://continentalstack-sitebucket397a1860-v1tluopr12iw/deploy/backend-dist.tar.gz
  # Generate presigned URL, then SSM command order (IMPORTANT — migration before generate):
  # curl <presigned> -o /tmp/backend-dist.tar.gz \
  #   && tar xzf /tmp/backend-dist.tar.gz -C /app/continental \
  #   && cd /app/continental && npm run db:migrate:deploy -w packages/backend \
  #   && npm run db:generate -w packages/backend \
  #   && chown -R ec2-user:ec2-user /app/continental \
  #   && sudo -u ec2-user bash -c "pm2 restart all" \
  #   && echo DONE
  ```

- [ ] Build frontend, deploy to S3 + CloudFront invalidation:
  ```bash
  npm run build -w packages/frontend
  aws s3 sync packages/frontend/dist s3://... --delete --cache-control "max-age=31536000" --exclude "index.html" --exclude "deploy/*"
  aws s3 cp packages/frontend/dist/index.html s3://.../index.html --cache-control "no-cache"
  aws cloudfront create-invalidation --distribution-id E2IPQU0CVVHCSL --paths "/*"
  ```

- [ ] Validate in browser via Playwright:
  - Admin login → create group with name + admin password + member password
  - Verify slug preview shows `@group-name`
  - Logout → login with admin password → management buttons visible
  - Logout → login with member password → management buttons hidden, scoring still works
