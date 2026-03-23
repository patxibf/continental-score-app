# Auth SP1: Self-Serve Registration & Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin-created shared-password groups with individual user accounts: email-verified self-serve registration, password reset, and multi-group login.

**Architecture:** New `User` + `AuthToken` models handle auth identity. `Player` becomes the group-membership record (adds `userId`, `role`, `groupId` directly). `Group` drops password fields, gains `slug`. `GroupPlayer` and `SeasonPlayer` tables are dropped entirely. All existing data is dropped — fresh migration.

**Tech Stack:** Fastify, Prisma (PostgreSQL), bcryptjs, Resend (email), JWT (cookie), React + TanStack Query, Vitest

---

## File Map

**New backend files:**
- `packages/backend/src/lib/slug.ts` — nameToSlug + uniqueSlug (moved from admin.ts)
- `packages/backend/src/lib/tokens.ts` — generateToken, createAuthToken, consumeToken
- `packages/backend/src/lib/mailer.ts` — sendVerificationEmail, sendPasswordResetEmail
- `packages/backend/src/routes/groups.ts` — GET/PATCH /api/groups/current

**Modified backend files:**
- `packages/backend/prisma/schema.prisma` — new models, drop old models
- `packages/backend/src/lib/__mocks__/prisma.ts` — add user/authToken, update player, remove groupPlayer/seasonPlayer
- `packages/backend/src/plugins/auth.ts` — new JWT payload type, new guards
- `packages/backend/src/test/helpers.ts` — new token factories with new payload shape
- `packages/backend/src/routes/auth.ts` — full rewrite
- `packages/backend/src/routes/admin.ts` — remove POST/PATCH, add GET /:id, update for slug field
- `packages/backend/src/routes/players.ts` — rewrite for Player.groupId (no GroupPlayer)
- `packages/backend/src/routes/seasons.ts` — remove SeasonPlayer endpoints, fix player queries
- `packages/backend/src/routes/games.ts` — remove GroupPlayer/SeasonPlayer calls
- `packages/backend/src/routes/stats.ts` — fix player.findFirst (groupLinks → groupId)

**New frontend files:**
- `packages/frontend/src/pages/Register.tsx`
- `packages/frontend/src/pages/VerifyEmail.tsx`
- `packages/frontend/src/pages/ForgotPassword.tsx`
- `packages/frontend/src/pages/ResetPassword.tsx`
- `packages/frontend/src/pages/PickGroup.tsx`

**Modified frontend files:**
- `packages/frontend/src/lib/api.ts` — new AuthUser + Group types
- `packages/frontend/src/hooks/useAuth.ts` — new login flow, emailVerified, groupRole
- `packages/frontend/src/pages/Login.tsx` — email field, forgot/register links
- `packages/frontend/src/components/Layout.tsx` — unverified email banner
- `packages/frontend/src/App.tsx` — new public routes

---

## Task 1: Schema migration

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`

- [ ] **Step 1: Replace schema.prisma content**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Admin {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

enum Currency {
  GBP
  EUR
  USD
}

enum GroupRole {
  OWNER
  ADMIN
  MEMBER
}

enum TokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
}

model User {
  id            String      @id @default(uuid())
  email         String      @unique
  passwordHash  String
  emailVerified Boolean     @default(false)
  createdAt     DateTime    @default(now())

  players       Player[]
  tokens        AuthToken[]
}

model AuthToken {
  id        String    @id @default(uuid())
  token     String    @unique
  type      TokenType
  userId    String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Group {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  currency  Currency @default(EUR)
  createdAt DateTime @default(now())

  players       Player[]
  seasons       Season[]
  telegramChats TelegramChat[]
}

model Player {
  id        String    @id @default(uuid())
  groupId   String
  userId    String?
  name      String
  avatar    String    @default("cat")
  role      GroupRole @default(MEMBER)
  email     String?
  active    Boolean   @default(true)
  createdAt DateTime  @default(now())

  user        User?        @relation(fields: [userId], references: [id])
  group       Group        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  gamePlayers GamePlayer[]
  roundScores RoundScore[]
  telegramUsers TelegramUser[]

  @@unique([groupId, userId])
}

model Season {
  id                 String       @id @default(uuid())
  groupId            String
  group              Group        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  name               String
  status             SeasonStatus @default(ACTIVE)
  createdAt          DateTime     @default(now())
  closedAt           DateTime?
  potEnabled         Boolean      @default(false)
  contributionAmount Decimal?     @db.Decimal(10, 2)

  games Game[]
}

enum SeasonStatus {
  ACTIVE
  CLOSED
}

model Game {
  id        String     @id @default(uuid())
  seasonId  String
  season    Season     @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  status    GameStatus @default(IN_PROGRESS)
  createdAt DateTime   @default(now())
  closedAt  DateTime?
  totalPot  Decimal?   @db.Decimal(10, 2)

  players GamePlayer[]
  rounds  Round[]
}

enum GameStatus {
  IN_PROGRESS
  CLOSED
}

model GamePlayer {
  id         String   @id @default(uuid())
  gameId     String
  game       Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  playerId   String
  player     Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  potAwarded Decimal? @db.Decimal(10, 2)

  @@unique([gameId, playerId])
}

model Round {
  id          String     @id @default(uuid())
  gameId      String
  game        Game       @relation(fields: [gameId], references: [id], onDelete: Cascade)
  roundNumber Int
  completedAt DateTime?
  scores      RoundScore[]
}

model RoundScore {
  id       String  @id @default(uuid())
  roundId  String
  round    Round   @relation(fields: [roundId], references: [id], onDelete: Cascade)
  playerId String
  player   Player  @relation(fields: [playerId], references: [id], onDelete: Cascade)
  points   Int
  wentOut  Boolean @default(false)

  @@unique([roundId, playerId])
}

model TelegramChat {
  id      String @id @default(uuid())
  chatId  String @unique
  groupId String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
}

model TelegramUser {
  id             String @id @default(uuid())
  telegramUserId String @unique
  playerId       String
  player         Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Install resend**

```bash
cd /Users/andresbenito/Documents/claude/continental/.worktrees/auth-rewrite/packages/backend
npm install resend
```

- [ ] **Step 3: Run migration (drops all data, rebuilds)**

```bash
cd /Users/andresbenito/Documents/claude/continental/.worktrees/auth-rewrite/packages/backend
npx dotenv -e .env -- npx prisma migrate reset --force
npx dotenv -e .env -- npx prisma generate
```

Expected: "Database reset successful" and "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/package.json packages/backend/package-lock.json
git commit -m "feat: rewrite schema — User, AuthToken, Player as membership, slug on Group"
```

---

## Task 2: Update Prisma mock

**Files:**
- Modify: `packages/backend/src/lib/__mocks__/prisma.ts`

- [ ] **Step 1: Replace mock content**

```typescript
import { vi } from 'vitest'

export const prisma = {
  admin: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  authToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  group: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  player: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  game: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  gamePlayer: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  round: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
  $transaction: vi.fn((ops: any) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(prisma),
  ),
}
```

- [ ] **Step 2: Run tests to verify mock compiles**

```bash
cd /Users/andresbenito/Documents/claude/continental/.worktrees/auth-rewrite
npm test -- --run 2>&1 | tail -20
```

Most tests will fail because routes still use old models — that's expected. Verify no import/compile errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lib/__mocks__/prisma.ts
git commit -m "refactor: update prisma mock — remove GroupPlayer/SeasonPlayer, add User/AuthToken"
```

---

## Task 3: Slug utility

**Files:**
- Create: `packages/backend/src/lib/slug.ts`
- Create: `packages/backend/src/lib/__tests__/slug.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/backend/src/lib/__tests__/slug.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js')
import { prisma } from '../prisma.js'
import { nameToSlug, uniqueSlug } from '../slug.js'

describe('nameToSlug', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(nameToSlug('My Group')).toBe('my-group')
  })

  it('removes special characters', () => {
    expect(nameToSlug('The O\'Briens!')).toBe('the-obriens')
  })

  it('collapses multiple dashes', () => {
    expect(nameToSlug('hello---world')).toBe('hello-world')
  })

  it('trims leading and trailing dashes', () => {
    expect(nameToSlug('-hello-')).toBe('hello')
  })

  it('truncates to 50 chars', () => {
    expect(nameToSlug('a'.repeat(60)).length).toBeLessThanOrEqual(50)
  })
})

describe('uniqueSlug', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns base slug when no conflict', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null)
    expect(await uniqueSlug('My Group')).toBe('my-group')
  })

  it('appends -2 on first conflict', async () => {
    vi.mocked(prisma.group.findUnique)
      .mockResolvedValueOnce({ id: 'x' } as any) // 'my-group' taken
      .mockResolvedValueOnce(null)               // 'my-group-2' free
    expect(await uniqueSlug('My Group')).toBe('my-group-2')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd /Users/andresbenito/Documents/claude/continental/.worktrees/auth-rewrite
npm test -- --run packages/backend/src/lib/__tests__/slug.test.ts 2>&1 | tail -10
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement slug.ts**

```typescript
// packages/backend/src/lib/slug.ts
import { prisma } from './prisma.js'

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = nameToSlug(name)
  let candidate = base
  let n = 2
  while (await prisma.group.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run packages/backend/src/lib/__tests__/slug.test.ts 2>&1 | tail -10
```

Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/lib/slug.ts packages/backend/src/lib/__tests__/slug.test.ts
git commit -m "feat: add slug utility (nameToSlug, uniqueSlug)"
```

---

## Task 4: Token helper

**Files:**
- Create: `packages/backend/src/lib/tokens.ts`
- Create: `packages/backend/src/lib/__tests__/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/backend/src/lib/__tests__/tokens.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js')
import { prisma } from '../prisma.js'
import { generateToken, createAuthToken, consumeToken } from '../tokens.js'

describe('generateToken', () => {
  it('returns 64-char hex string', () => {
    const t = generateToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns unique values', () => {
    expect(generateToken()).not.toBe(generateToken())
  })
})

describe('createAuthToken', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates token in db and returns the hex string', async () => {
    vi.mocked(prisma.authToken.create).mockResolvedValueOnce({
      token: 'abc123',
    } as any)

    const result = await createAuthToken('user-1', 'EMAIL_VERIFICATION', 24)
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'EMAIL_VERIFICATION',
        }),
      }),
    )
    expect(result).toBe('abc123')
  })
})

describe('consumeToken', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null when token not found', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce(null)
    expect(await consumeToken('bad', 'EMAIL_VERIFICATION')).toBeNull()
  })

  it('returns null when token is expired', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    } as any)
    expect(await consumeToken('tok', 'EMAIL_VERIFICATION')).toBeNull()
  })

  it('returns null when token already used', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 10000),
      usedAt: new Date(),
    } as any)
    expect(await consumeToken('tok', 'EMAIL_VERIFICATION')).toBeNull()
  })

  it('marks usedAt and returns userId on valid token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 10000),
      usedAt: null,
    } as any)
    vi.mocked(prisma.authToken.update).mockResolvedValueOnce({} as any)

    const result = await consumeToken('tok', 'EMAIL_VERIFICATION')
    expect(result).toEqual({ userId: 'u1' })
    expect(prisma.authToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { usedAt: expect.any(Date) },
    })
  })

  it('returns null when type does not match', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 10000),
      usedAt: null,
    } as any)
    expect(await consumeToken('tok', 'EMAIL_VERIFICATION')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- --run packages/backend/src/lib/__tests__/tokens.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement tokens.ts**

```typescript
// packages/backend/src/lib/tokens.ts
import crypto from 'crypto'
import { prisma } from './prisma.js'

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function createAuthToken(
  userId: string,
  type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  expiryHours: number,
): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)
  const record = await prisma.authToken.create({
    data: { token, type, userId, expiresAt },
    select: { token: true },
  })
  return record.token
}

export async function consumeToken(
  token: string,
  type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
): Promise<{ userId: string } | null> {
  const record = await prisma.authToken.findUnique({ where: { token } })
  if (!record) return null
  if (record.type !== type) return null
  if (record.usedAt) return null
  if (record.expiresAt < new Date()) return null

  await prisma.authToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })
  return { userId: record.userId }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run packages/backend/src/lib/__tests__/tokens.test.ts 2>&1 | tail -10
```

Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/lib/tokens.ts packages/backend/src/lib/__tests__/tokens.test.ts
git commit -m "feat: add token helper (generateToken, createAuthToken, consumeToken)"
```

---

## Task 5: Mailer module

**Files:**
- Create: `packages/backend/src/lib/mailer.ts`
- Create: `packages/backend/src/lib/__tests__/mailer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/backend/src/lib/__tests__/mailer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock resend before importing mailer
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }),
    },
  })),
}))

import { sendVerificationEmail, sendPasswordResetEmail } from '../mailer.js'

describe('sendVerificationEmail', () => {
  it('calls resend.emails.send without throwing', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'noreply@test.com'
    process.env.FRONTEND_URL = 'http://localhost:5173'

    await expect(
      sendVerificationEmail('user@example.com', 'Alice', 'abc123tok'),
    ).resolves.not.toThrow()
  })
})

describe('sendPasswordResetEmail', () => {
  it('calls resend.emails.send without throwing', async () => {
    await expect(
      sendPasswordResetEmail('user@example.com', 'Alice', 'reset123tok'),
    ).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- --run packages/backend/src/lib/__tests__/mailer.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement mailer.ts**

```typescript
// packages/backend/src/lib/mailer.ts
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`
  const resend = getResend()
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@continental.app',
    to,
    subject: 'Verify your Continental account',
    text: `Hi ${name},\n\nVerify your email here: ${url}\n\nLink expires in 24 hours.`,
    html: `<p>Hi ${name},</p><p><a href="${url}">Verify your email</a></p><p>Link expires in 24 hours.</p>`,
  })
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const url = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
  const resend = getResend()
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@continental.app',
    to,
    subject: 'Reset your Continental password',
    text: `Hi ${name},\n\nReset your password here: ${url}\n\nLink expires in 1 hour.`,
    html: `<p>Hi ${name},</p><p><a href="${url}">Reset your password</a></p><p>Link expires in 1 hour.</p>`,
  })
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run packages/backend/src/lib/__tests__/mailer.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/lib/mailer.ts packages/backend/src/lib/__tests__/mailer.test.ts
git commit -m "feat: add mailer module (sendVerificationEmail, sendPasswordResetEmail)"
```

---

## Task 6: Auth plugin + test helpers

**Files:**
- Modify: `packages/backend/src/plugins/auth.ts`
- Modify: `packages/backend/src/test/helpers.ts`

- [ ] **Step 1: Rewrite auth plugin**

```typescript
// packages/backend/src/plugins/auth.ts
import fp from 'fastify-plugin'
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

export type JWTPayload =
  | { role: 'admin'; adminId: string }
  | { role: 'user'; userId: string; playerId: string; groupId: string; groupRole: 'owner' | 'admin' | 'member' }

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'admin') reply.status(403).send({ error: 'Forbidden' })
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'user') reply.status(403).send({ error: 'Forbidden' })
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroupAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'user') {
        reply.status(403).send({ error: 'Forbidden' })
        return
      }
      if (payload.groupRole !== 'owner' && payload.groupRole !== 'admin') {
        reply.status(403).send({ error: 'Forbidden: admin access required' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.decorate('requireGroupOwner', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as JWTPayload
      if (payload.role !== 'user' || payload.groupRole !== 'owner') {
        reply.status(403).send({ error: 'Forbidden: owner access required' })
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
    requireGroupOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(authPlugin)
```

- [ ] **Step 2: Rewrite test helpers**

```typescript
// packages/backend/src/test/helpers.ts
import Fastify, { FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import authPlugin from '../plugins/auth.js'
import authRoutes from '../routes/auth.js'
import adminRoutes from '../routes/admin.js'
import groupRoutes from '../routes/groups.js'
import roundRoutes from '../routes/rounds.js'
import seasonRoutes from '../routes/seasons.js'
import statsRoutes from '../routes/stats.js'
import gameRoutes from '../routes/games.js'
import playerRoutes from '../routes/players.js'

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
  await app.register(groupRoutes)
  await app.register(roundRoutes)
  await app.register(seasonRoutes)
  await app.register(statsRoutes)
  await app.register(gameRoutes)
  await app.register(playerRoutes)

  await app.ready()
  return app
}

// Group user with owner role (equivalent to old groupToken admin)
export function groupToken(
  app: FastifyInstance,
  groupId = 'group-1',
  groupRole: 'owner' | 'admin' | 'member' = 'owner',
): string {
  return app.jwt.sign({
    role: 'user',
    userId: 'user-1',
    playerId: 'player-1',
    groupId,
    groupRole,
  })
}

// Member token (read-only)
export function memberToken(app: FastifyInstance, groupId = 'group-1'): string {
  return groupToken(app, groupId, 'member')
}

export function adminToken(app: FastifyInstance, adminId = 'admin-1'): string {
  return app.jwt.sign({ role: 'admin', adminId })
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/plugins/auth.ts packages/backend/src/test/helpers.ts
git commit -m "feat: rewrite auth plugin with new JWT payload; update test helpers"
```

---

## Task 7: Auth routes rewrite

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/src/routes/__tests__/auth.test.ts`

- [ ] **Step 1: Write new auth tests first**

```typescript
// packages/backend/src/routes/__tests__/auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { buildApp, groupToken, adminToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
vi.mock('../../lib/mailer.js')
vi.mock('../../lib/tokens.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tokens.js')>()
  return {
    ...actual,
    createAuthToken: vi.fn().mockResolvedValue('mock-token-hex'),
  }
})

import { prisma } from '../../lib/prisma.js'
import { createAuthToken } from '../../lib/tokens.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp()
  vi.resetAllMocks()
})

afterEach(async () => {
  await app?.close()
})

// ---- Register ----

describe('POST /api/auth/register', () => {
  it('creates user, group, player and returns 201', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null) // email available
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null) // slug available
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: any) => fn(prisma))
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'user-1', email: 'a@b.com', emailVerified: false,
    } as any)
    vi.mocked(prisma.group.create).mockResolvedValueOnce({
      id: 'group-1', name: 'Test Group', slug: 'test-group', currency: 'EUR',
    } as any)
    vi.mocked(prisma.player.create).mockResolvedValueOnce({
      id: 'player-1', name: 'Alice', groupId: 'group-1', userId: 'user-1', role: 'OWNER',
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test Group',
        playerName: 'Alice',
        avatar: 'cat',
        email: 'a@b.com',
        password: 'password123',
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 400 EMAIL_TAKEN when email exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u1' } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test', playerName: 'Alice', avatar: 'cat',
        email: 'taken@b.com', password: 'password123',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('EMAIL_TAKEN')
  })

  it('returns 400 when password is too short', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test', playerName: 'Alice', avatar: 'cat',
        email: 'a@b.com', password: 'short',
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when groupName is too short', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'X', playerName: 'Alice', avatar: 'cat',
        email: 'a@b.com', password: 'password123',
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when avatar is invalid', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        groupName: 'Test Group', playerName: 'Alice', avatar: 'dragon',
        email: 'a@b.com', password: 'password123',
      },
    })

    expect(res.statusCode).toBe(400)
  })
})

// ---- Verify email ----

describe('POST /api/auth/verify-email', () => {
  it('marks emailVerified and returns 200 on valid token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 10000), usedAt: null,
    } as any)
    vi.mocked(prisma.authToken.update).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: 'validtoken' },
    })

    expect(res.statusCode).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { emailVerified: true },
    })
  })

  it('returns 400 INVALID_TOKEN on bad token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: 'badtoken' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_TOKEN')
  })
})

// ---- Forgot password ----

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 (no enumeration)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'unknown@example.com' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('creates reset token when user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com',
    } as any)
    vi.mocked(prisma.authToken.updateMany).mockResolvedValueOnce({ count: 0 } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'a@b.com' },
    })

    expect(res.statusCode).toBe(200)
    expect(createAuthToken).toHaveBeenCalledWith('u1', 'PASSWORD_RESET', 1)
  })
})

// ---- Reset password ----

describe('POST /api/auth/reset-password', () => {
  it('updates password on valid token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce({
      id: 't1', userId: 'u1', type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 10000), usedAt: null,
    } as any)
    vi.mocked(prisma.authToken.update).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'validtoken', password: 'newpassword123' },
    })

    expect(res.statusCode).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    )
  })

  it('returns 400 on expired/used token', async () => {
    vi.mocked(prisma.authToken.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'bad', password: 'newpassword123' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_TOKEN')
  })
})

// ---- Login ----

describe('POST /api/auth/login', () => {
  it('returns 200 with JWT for single-group user', async () => {
    const hash = await bcrypt.hash('pass123', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: hash, emailVerified: true,
    } as any)
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([{
      id: 'p1', groupId: 'g1', role: 'OWNER',
      group: { id: 'g1', name: 'My Group', slug: 'my-group', currency: 'EUR' },
    }] as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pass123' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.json()).not.toHaveProperty('requiresGroupSelection')
  })

  it('returns requiresGroupSelection when user has multiple groups', async () => {
    const hash = await bcrypt.hash('pass123', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: hash, emailVerified: true,
    } as any)
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
      { id: 'p1', groupId: 'g1', role: 'OWNER', group: { id: 'g1', name: 'Group 1', slug: 'g1' } },
      { id: 'p2', groupId: 'g2', role: 'MEMBER', group: { id: 'g2', name: 'Group 2', slug: 'g2' } },
    ] as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'pass123' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().requiresGroupSelection).toBe(true)
    expect(res.json().groups).toHaveLength(2)
  })

  it('returns 401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: hash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.com', password: 'wrong' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@b.com', password: 'pass' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('logs in admin by username via email field', async () => {
    const hash = await bcrypt.hash('adminpass', 1)
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1', username: 'admin', passwordHash: hash,
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin', password: 'adminpass' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')
  })
})

// ---- Switch group ----

describe('POST /api/auth/switch-group', () => {
  it('issues new JWT for valid group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({
      id: 'p2', groupId: 'g2', role: 'MEMBER',
      group: { id: 'g2', name: 'Group 2', slug: 'g2', currency: 'EUR' },
    } as any)

    const token = groupToken(app, 'g1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-group',
      payload: { groupId: 'g2' },
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 403 when user not in that group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)

    const token = groupToken(app, 'g1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-group',
      payload: { groupId: 'g-other' },
      cookies: { token },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ---- Me ----

describe('GET /api/auth/me', () => {
  it('returns user shape with groupRole and emailVerified', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1', email: 'a@b.com', emailVerified: true,
    } as any)
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({
      id: 'player-1', name: 'Alice', avatar: 'cat', role: 'OWNER',
      group: { id: 'group-1', name: 'My Group', slug: 'my-group', currency: 'EUR' },
    } as any)

    const token = groupToken(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.role).toBe('user')
    expect(body.email).toBe('a@b.com')
    expect(body.emailVerified).toBe(true)
    expect(body.groupRole).toBe('owner')
    expect(body.groupSlug).toBe('my-group')
    expect(body.playerName).toBe('Alice')
  })

  it('returns admin shape', async () => {
    vi.mocked(prisma.admin.findUnique).mockResolvedValueOnce({
      id: 'admin-1', username: 'admin',
    } as any)

    const token = adminToken(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')
    expect(res.json().username).toBe('admin')
  })

  it('returns 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})

// ---- Auth guards ----

describe('requireGroupAdmin guard', () => {
  it('allows OWNER', async () => {
    vi.mocked(prisma.season.findMany).mockResolvedValueOnce([])
    const token = groupToken(app, 'group-1', 'owner')
    const res = await app.inject({
      method: 'GET',
      url: '/api/seasons',
      cookies: { token },
    })
    // requireGroup on seasons; check it reaches the handler
    expect(res.statusCode).toBe(200)
  })

  it('returns 403 when MEMBER calls admin-only route', async () => {
    const token = groupToken(app, 'group-1', 'member')
    const res = await app.inject({
      method: 'POST',
      url: '/api/seasons',
      payload: { name: 'S1' },
      cookies: { token },
    })
    expect(res.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test -- --run packages/backend/src/routes/__tests__/auth.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Rewrite auth.ts — copy this implementation exactly as written (do not modify)**

```typescript
// packages/backend/src/routes/auth.ts
import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { uniqueSlug } from '../lib/slug.js'
import { generateToken, createAuthToken, consumeToken } from '../lib/tokens.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/mailer.js'
import { JWTPayload } from '../plugins/auth.js'

const AVATAR_OPTIONS = [
  'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
  'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
]

const registerSchema = z.object({
  groupName: z.string().min(2).max(50),
  playerName: z.string().min(2).max(50),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar'),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  groupId: z.string().optional(),
})

function setJwtCookie(fastify: any, reply: any, payload: JWTPayload) {
  const token = fastify.jwt.sign(payload)
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/auth/register
  fastify.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
    }
    const { groupName, playerName, avatar, email, password } = body.data

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return reply.status(400).send({ error: 'EMAIL_TAKEN' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const slug = await uniqueSlug(groupName)

    let user: any, group: any, player: any
    await prisma.$transaction(async (tx) => {
      user = await tx.user.create({
        data: { email, passwordHash, emailVerified: false },
      })
      group = await tx.group.create({
        data: { name: groupName, slug, currency: 'EUR' },
      })
      player = await tx.player.create({
        data: { name: playerName, avatar, groupId: group.id, userId: user.id, role: 'OWNER' },
      })
    })

    // Create verification token and send email outside transaction (best-effort)
    try {
      const verifyToken = await createAuthToken(user.id, 'EMAIL_VERIFICATION', 24)
      await sendVerificationEmail(email, playerName, verifyToken)
    } catch (e) {
      console.error('Failed to send verification email', e)
    }

    setJwtCookie(fastify, reply, {
      role: 'user',
      userId: user.id,
      playerId: player.id,
      groupId: group.id,
      groupRole: 'owner',
    })

    return reply.status(201).send({
      role: 'user',
      userId: user.id,
      email: user.email,
      emailVerified: false,
      playerId: player.id,
      playerName: player.name,
      playerAvatar: player.avatar,
      groupId: group.id,
      groupName: group.name,
      groupSlug: group.slug,
      groupRole: 'owner',
      currency: group.currency,
    })
  })

  // POST /api/auth/verify-email
  fastify.post('/api/auth/verify-email', async (request, reply) => {
    const body = z.object({ token: z.string() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

    const result = await consumeToken(body.data.token, 'EMAIL_VERIFICATION')
    if (!result) return reply.status(400).send({ error: 'INVALID_TOKEN' })

    await prisma.user.update({ where: { id: result.userId }, data: { emailVerified: true } })
    return reply.send({ message: 'Email verified' })
  })

  // POST /api/auth/resend-verification
  fastify.post('/api/auth/resend-verification', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const payload = request.user as JWTPayload
    if (payload.role !== 'user') return reply.status(403).send({ error: 'Forbidden' })

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (user.emailVerified) return reply.status(400).send({ error: 'Email already verified' })

    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION', usedAt: null },
      data: { usedAt: new Date() },
    })

    const token = await createAuthToken(user.id, 'EMAIL_VERIFICATION', 24)
    const player = await prisma.player.findFirst({ where: { userId: user.id } })
    await sendVerificationEmail(user.email, player?.name ?? 'there', token)
    return reply.send({ ok: true })
  })

  // POST /api/auth/forgot-password
  fastify.post('/api/auth/forgot-password', async (request, reply) => {
    const body = z.object({ email: z.string().email() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) return reply.send({ ok: true }) // silent

    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    })
    const token = await createAuthToken(user.id, 'PASSWORD_RESET', 1)
    const player = await prisma.player.findFirst({ where: { userId: user.id } })
    try {
      await sendPasswordResetEmail(user.email, player?.name ?? 'there', token)
    } catch (e) {
      console.error('Failed to send reset email', e)
    }
    return reply.send({ ok: true })
  })

  // POST /api/auth/reset-password
  fastify.post('/api/auth/reset-password', async (request, reply) => {
    const body = z.object({ token: z.string(), password: z.string().min(8) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })

    const result = await consumeToken(body.data.token, 'PASSWORD_RESET')
    if (!result) return reply.status(400).send({ error: 'INVALID_TOKEN' })

    const passwordHash = await bcrypt.hash(body.data.password, 12)
    await prisma.user.update({ where: { id: result.userId }, data: { passwordHash } })
    return reply.send({ ok: true })
  })

  // POST /api/auth/login
  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })
    const { email, password, groupId: requestedGroupId } = body.data

    // Try admin (email field used as username)
    const admin = await prisma.admin.findUnique({ where: { username: email } })
    if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
      setJwtCookie(fastify, reply, { role: 'admin', adminId: admin.id })
      return reply.send({ role: 'admin', adminId: admin.id, username: admin.username })
    }

    // Try user
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const players = await prisma.player.findMany({
      where: { userId: user.id },
      include: { group: true },
    })

    if (players.length === 0) {
      return reply.status(403).send({ error: 'NO_GROUP' })
    }

    // Single group — issue JWT immediately
    if (players.length === 1) {
      const p = players[0]
      const groupRole = p.role.toLowerCase() as 'owner' | 'admin' | 'member'
      setJwtCookie(fastify, reply, { role: 'user', userId: user.id, playerId: p.id, groupId: p.groupId, groupRole })
      return reply.send(meResponse(user, p))
    }

    // Multiple groups
    if (requestedGroupId) {
      const p = players.find(pl => pl.groupId === requestedGroupId)
      if (!p) return reply.status(403).send({ error: 'Forbidden' })
      const groupRole = p.role.toLowerCase() as 'owner' | 'admin' | 'member'
      setJwtCookie(fastify, reply, { role: 'user', userId: user.id, playerId: p.id, groupId: p.groupId, groupRole })
      return reply.send(meResponse(user, p))
    }

    return reply.send({
      requiresGroupSelection: true,
      groups: players.map(p => ({
        groupId: p.groupId,
        groupName: p.group.name,
        groupSlug: p.group.slug,
        groupRole: p.role.toLowerCase(),
      })),
    })
  })

  // POST /api/auth/switch-group
  fastify.post('/api/auth/switch-group', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const payload = request.user as JWTPayload
    if (payload.role !== 'user') return reply.status(403).send({ error: 'Forbidden' })

    const body = z.object({ groupId: z.string() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

    const player = await prisma.player.findFirst({
      where: { userId: payload.userId, groupId: body.data.groupId },
      include: { group: true },
    })
    if (!player) return reply.status(403).send({ error: 'Forbidden' })

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const groupRole = player.role.toLowerCase() as 'owner' | 'admin' | 'member'
    setJwtCookie(fastify, reply, { role: 'user', userId: user.id, playerId: player.id, groupId: player.groupId, groupRole })
    return reply.send(meResponse(user, player))
  })

  // GET /api/auth/me
  fastify.get('/api/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as JWTPayload
    if (payload.role === 'admin') {
      const admin = await prisma.admin.findUnique({
        where: { id: payload.adminId },
        select: { id: true, username: true },
      })
      return reply.send({ role: 'admin', adminId: admin?.id, username: admin?.username })
    }

    if (payload.role === 'user') {
      const user = await prisma.user.findUnique({ where: { id: payload.userId } })
      if (!user) return reply.status(401).send({ error: 'Unauthorized' })

      const player = await prisma.player.findFirst({
        where: { id: payload.playerId, userId: payload.userId },
        include: { group: true },
      })
      if (!player) return reply.status(401).send({ error: 'Unauthorized' })

      return reply.send(meResponse(user, player))
    }

    return reply.status(401).send({ error: 'Unauthorized' })
  })

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })
}

function meResponse(user: any, player: any) {
  return {
    role: 'user' as const,
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    playerId: player.id,
    playerName: player.name,
    playerAvatar: player.avatar,
    groupId: player.groupId,
    groupName: player.group.name,
    groupSlug: player.group.slug,
    groupRole: player.role.toLowerCase(),
    currency: player.group.currency,
  }
}

export default authRoutes
```

- [ ] **Step 4: Run auth tests**

```bash
npm test -- --run packages/backend/src/routes/__tests__/auth.test.ts 2>&1 | tail -20
```

Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/auth.ts packages/backend/src/routes/__tests__/auth.test.ts
git commit -m "feat: rewrite auth routes — register, verify-email, forgot/reset-password, login, switch-group"
```

---

## Task 8: Admin routes update

**Files:**
- Modify: `packages/backend/src/routes/admin.ts`

- [ ] **Step 1: Rewrite admin.ts**

```typescript
// packages/backend/src/routes/admin.ts
import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/groups — list all groups with member count
  fastify.get(
    '/api/admin/groups',
    { preHandler: [fastify.requireAdmin] },
    async (_request, reply) => {
      const groups = await prisma.group.findMany({
        select: {
          id: true, name: true, slug: true, createdAt: true, currency: true,
          _count: { select: { players: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(groups)
    },
  )

  // GET /api/admin/groups/:id
  fastify.get(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const group = await prisma.group.findUnique({
        where: { id },
        select: {
          id: true, name: true, slug: true, createdAt: true, currency: true,
          _count: { select: { players: true } },
        },
      })
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      return reply.send(group)
    },
  )

  // DELETE /api/admin/groups/:id
  fastify.delete(
    '/api/admin/groups/:id',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const group = await prisma.group.findUnique({ where: { id } })
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      await prisma.group.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}

export default adminRoutes
```

- [ ] **Step 2: Update admin.test.ts** — Remove tests for POST/PATCH (no longer exist). Update GET tests to use `slug` instead of `username`. Verify `hasMemberPassword` no longer returned.

Open `packages/backend/src/routes/__tests__/admin.test.ts`. Remove all tests for `POST /api/admin/groups` and `PATCH /api/admin/groups/:id`. Update GET mock to return `slug` field instead of `username`. Run tests.

- [ ] **Step 3: Run admin tests**

```bash
npm test -- --run packages/backend/src/routes/__tests__/admin.test.ts 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/admin.ts packages/backend/src/routes/__tests__/admin.test.ts
git commit -m "refactor: admin routes — remove POST/PATCH group, add GET /:id, use slug field"
```

---

## Task 9: Group routes (new)

**Files:**
- Create: `packages/backend/src/routes/groups.ts`
- Create: `packages/backend/src/routes/__tests__/groups.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/backend/src/routes/__tests__/groups.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken, memberToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance
beforeEach(async () => { app = await buildApp(); vi.resetAllMocks() })
afterEach(async () => { await app?.close() })

describe('GET /api/groups/current', () => {
  it('returns current group info', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: 'group-1', name: 'My Group', slug: 'my-group', currency: 'EUR', createdAt: new Date(),
      _count: { players: 3 },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/current',
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'group-1', name: 'My Group', slug: 'my-group' })
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/groups/current' })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/groups/current', () => {
  it('allows owner/admin to update name', async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({ id: 'group-1' } as any)
    vi.mocked(prisma.group.update).mockResolvedValueOnce({
      id: 'group-1', name: 'New Name', slug: 'my-group', currency: 'EUR',
    } as any)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/groups/current',
      payload: { name: 'New Name' },
      cookies: { token: groupToken(app) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('New Name')
  })

  it('returns 403 for member', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/groups/current',
      payload: { name: 'New Name' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Create groups.ts**

```typescript
// packages/backend/src/routes/groups.ts
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { JWTPayload } from '../plugins/auth.js'

const updateGroupSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  currency: z.enum(['GBP', 'EUR', 'USD']).optional(),
})

const groupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/groups/current',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: {
          id: true, name: true, slug: true, currency: true, createdAt: true,
          _count: { select: { players: true } },
        },
      })
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      return reply.send(group)
    },
  )

  fastify.patch(
    '/api/groups/current',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = updateGroupSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'Invalid request' })

      const group = await prisma.group.findUnique({ where: { id: groupId } })
      if (!group) return reply.status(404).send({ error: 'Group not found' })

      const updated = await prisma.group.update({
        where: { id: groupId },
        data: body.data,
        select: { id: true, name: true, slug: true, currency: true },
      })
      return reply.send(updated)
    },
  )
}

export default groupRoutes
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run packages/backend/src/routes/__tests__/groups.test.ts 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/groups.ts packages/backend/src/routes/__tests__/groups.test.ts
git commit -m "feat: add group routes (GET/PATCH /api/groups/current)"
```

---

## Task 10: Players routes rewrite

**Files:**
- Modify: `packages/backend/src/routes/players.ts`

- [ ] **Step 1: Rewrite players.ts**

Player now has `groupId` directly. No `GroupPlayer`. The link/unlink endpoints are removed.

```typescript
// packages/backend/src/routes/players.ts
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const AVATAR_OPTIONS = [
  'cat', 'fox', 'bear', 'rabbit', 'wolf', 'owl', 'lion', 'tiger',
  'penguin', 'dolphin', 'elephant', 'giraffe', 'koala', 'panda', 'zebra',
]

const createPlayerSchema = z.object({
  name: z.string().min(1).max(100),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar'),
  email: z.string().email().optional(),
})

const updatePlayerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().refine(v => AVATAR_OPTIONS.includes(v), 'Invalid avatar').optional(),
  email: z.string().email().optional().nullable(),
  active: z.boolean().optional(),
})

const playerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/players — list active players in the current group
  fastify.get(
    '/api/players',
    { preHandler: [fastify.requireGroup] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const players = await prisma.player.findMany({
        where: { groupId },
        orderBy: { name: 'asc' },
      })
      return reply.send(players)
    },
  )

  // POST /api/players — create player in group (admin only, for SP2 invitations in future)
  fastify.post(
    '/api/players',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const body = createPlayerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const player = await prisma.player.create({
        data: { ...body.data, groupId, role: 'MEMBER' },
      })
      return reply.status(201).send(player)
    },
  )

  // PATCH /api/players/:id
  fastify.patch(
    '/api/players/:id',
    { preHandler: [fastify.requireGroupAdmin] },
    async (request, reply) => {
      const { groupId } = request.user as { groupId: string }
      const { id } = request.params as { id: string }
      const body = updatePlayerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten() })
      }

      const player = await prisma.player.findFirst({ where: { id, groupId } })
      if (!player) return reply.status(404).send({ error: 'Player not found' })

      const updated = await prisma.player.update({ where: { id }, data: body.data })
      return reply.send(updated)
    },
  )
}

export default playerRoutes
```

- [ ] **Step 2: Rewrite players.test.ts to use new model**

The old test file references `prisma.groupPlayer` which no longer exists. Write a new test file:

```typescript
// packages/backend/src/routes/__tests__/players.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp, groupToken, memberToken } from '../../test/helpers.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../lib/prisma.js')
import { prisma } from '../../lib/prisma.js'

let app: FastifyInstance
beforeEach(async () => { app = await buildApp(); vi.resetAllMocks() })
afterEach(async () => { await app?.close() })

describe('GET /api/players', () => {
  it('returns players for the group', async () => {
    vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
      { id: 'p1', name: 'Alice', avatar: 'cat', active: true } as any,
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/api/players',
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/players' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/players', () => {
  it('creates player for group admin', async () => {
    vi.mocked(prisma.player.create).mockResolvedValueOnce({
      id: 'p2', name: 'Bob', avatar: 'fox', groupId: 'group-1', role: 'MEMBER',
    } as any)
    const res = await app.inject({
      method: 'POST',
      url: '/api/players',
      payload: { name: 'Bob', avatar: 'fox' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Bob')
  })

  it('returns 403 for member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/players',
      payload: { name: 'Bob', avatar: 'fox' },
      cookies: { token: memberToken(app) },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('PATCH /api/players/:id', () => {
  it('updates player if in group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce({ id: 'p1' } as any)
    vi.mocked(prisma.player.update).mockResolvedValueOnce({ id: 'p1', name: 'Alicia' } as any)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p1',
      payload: { name: 'Alicia' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 404 if player not in group', async () => {
    vi.mocked(prisma.player.findFirst).mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/players/p-other',
      payload: { name: 'Alicia' },
      cookies: { token: groupToken(app) },
    })
    expect(res.statusCode).toBe(404)
  })
})
```

Run:
```bash
npm test -- --run packages/backend/src/routes/__tests__/players.test.ts 2>&1 | tail -10
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/players.ts packages/backend/src/routes/__tests__/players.test.ts
git commit -m "refactor: rewrite players routes — Player.groupId direct, remove GroupPlayer link endpoints"
```

---

## Task 11: Seasons + games routes update

**Files:**
- Modify: `packages/backend/src/routes/seasons.ts`
- Modify: `packages/backend/src/routes/games.ts`

- [ ] **Step 1: Update seasons.ts — remove SeasonPlayer endpoints, fix player queries**

In `seasons.ts`, find these sections and replace:

**`GET /api/seasons/:id/players`** — was `seasonPlayer.findMany`, now returns group players:
```typescript
fastify.get(
  '/api/seasons/:id/players',
  { preHandler: [fastify.requireGroup] },
  async (request, reply) => {
    const { groupId } = request.user as { groupId: string }
    const { id } = request.params as { id: string }
    const season = await prisma.season.findFirst({ where: { id, groupId } })
    if (!season) return reply.status(404).send({ error: 'Season not found' })
    const players = await prisma.player.findMany({
      where: { groupId },
      orderBy: { name: 'asc' },
    })
    return reply.send(players)
  },
)
```

**Remove entirely:** `POST /api/seasons/:id/players` and `DELETE /api/seasons/:id/players/:playerId` — SeasonPlayer no longer exists.

- [ ] **Step 2: Update games.ts — remove GroupPlayer and SeasonPlayer calls**

In `POST /api/seasons/:seasonId/games`, replace the player verification block:

Old:
```typescript
const playerLinks = await prisma.groupPlayer.findMany({
  where: { groupId, playerId: { in: body.data.playerIds } },
})
if (playerLinks.length !== body.data.playerIds.length) {
  return reply.status(400).send({ error: 'One or more players not found in group' })
}
```

New:
```typescript
const groupPlayers = await prisma.player.findMany({
  where: { groupId, id: { in: body.data.playerIds } },
})
if (groupPlayers.length !== body.data.playerIds.length) {
  return reply.status(400).send({ error: 'One or more players not found in group' })
}
```

Also remove the SeasonPlayer upsert block at the end of game creation (lines 82-88 in current games.ts):
```typescript
// REMOVE this entire block:
for (const playerId of body.data.playerIds) {
  await prisma.seasonPlayer.upsert({ ... })
}
```

- [ ] **Step 3: Update stats.ts — fix player lookup**

In `GET /api/players/:id/stats`, replace:
```typescript
const player = await prisma.player.findFirst({
  where: { id, groupLinks: { some: { groupId } } },
})
```
With:
```typescript
const player = await prisma.player.findFirst({
  where: { id, groupId },
})
```

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/andresbenito/Documents/claude/continental/.worktrees/auth-rewrite
npm test -- --run 2>&1 | tail -30
```

Fix any remaining compile errors.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/seasons.ts packages/backend/src/routes/games.ts packages/backend/src/routes/stats.ts
git commit -m "refactor: remove SeasonPlayer/GroupPlayer from seasons, games, stats routes"
```

---

## Task 12: Update existing backend tests for new JWT payload

**Files:**
- Modify: `packages/backend/src/routes/__tests__/seasons.test.ts`
- Modify: `packages/backend/src/routes/__tests__/games.test.ts`
- Modify: `packages/backend/src/routes/__tests__/rounds.test.ts`
- Modify: `packages/backend/src/routes/__tests__/stats.test.ts`

- [ ] **Step 1: Fix seasons.test.ts**

The tests use `groupToken(app)` — this now returns the new JWT payload, so routes that do `request.user as { groupId: string }` still work fine. The main changes needed:
1. Remove tests for `POST /api/seasons/:id/players` and `DELETE /api/seasons/:id/players/:playerId` (SeasonPlayer gone)
2. Update any mock for `prisma.groupPlayer` or `prisma.seasonPlayer` to use `prisma.player.findMany`

Open the file, find and remove SeasonPlayer tests, update mocks.

- [ ] **Step 2: Fix games.test.ts**

In tests for `POST /api/seasons/:seasonId/games`, the old mock was:
```typescript
vi.mocked(prisma.groupPlayer.findMany).mockResolvedValueOnce([
  { groupId: 'group-1', playerId: 'player-1' },
  { groupId: 'group-1', playerId: 'player-2' },
] as any)
```

Replace with:
```typescript
vi.mocked(prisma.player.findMany).mockResolvedValueOnce([
  { id: 'player-1', groupId: 'group-1' },
  { id: 'player-2', groupId: 'group-1' },
] as any)
```

Also remove any `vi.mocked(prisma.seasonPlayer.upsert)` calls — that upsert no longer happens.

- [ ] **Step 3: Run all backend tests**

```bash
npm test -- --run packages/backend 2>&1 | tail -30
```

Expected: 0 failures

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/__tests__/
git commit -m "test: update backend tests for new JWT payload and removed GroupPlayer/SeasonPlayer"
```

---

## Task 13: Frontend — api.ts types update

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`

- [ ] **Step 1: Update AuthUser and Group interfaces**

Replace the `AuthUser` and `Group` interfaces:

```typescript
export interface AuthUser {
  role: 'admin' | 'user'
  // user fields:
  userId?: string
  email?: string
  emailVerified?: boolean
  playerId?: string
  playerName?: string
  playerAvatar?: string
  groupId?: string
  groupName?: string
  groupSlug?: string
  groupRole?: 'owner' | 'admin' | 'member'
  currency?: 'GBP' | 'EUR' | 'USD'
  // admin fields:
  adminId?: string
  username?: string
  // multi-group selection:
  requiresGroupSelection?: boolean
  groups?: Array<{ groupId: string; groupName: string; groupSlug: string; groupRole: string }>
}

export interface Group {
  id: string
  name: string
  slug: string
  createdAt: string
  currency: 'GBP' | 'EUR' | 'USD'
  _count?: { players: number }
}
```

Also update `Player` interface — remove `phone` field (no longer in schema):
```typescript
export interface Player {
  id: string
  name: string
  avatar: string
  email?: string | null
  active: boolean
  createdAt: string
}
```

- [ ] **Step 2: Run frontend tests to catch type errors**

```bash
npm test -- --run packages/frontend 2>&1 | grep -E "(FAIL|Error)" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/api.ts
git commit -m "refactor: update AuthUser/Group/Player types for new auth model"
```

---

## Task 14: Frontend — useAuth.ts update

**Files:**
- Modify: `packages/frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Rewrite useAuth.ts**

```typescript
// packages/frontend/src/hooks/useAuth.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, AuthUser } from '@/lib/api'
import { useNavigate } from 'react-router-dom'

export function useAuth() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AuthUser>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string; groupId?: string }) =>
      api.post<AuthUser>('/auth/login', credentials),
    onSuccess: (data) => {
      if (data.requiresGroupSelection) {
        queryClient.setQueryData(['auth', 'me'], data)
        navigate('/pick-group')
        return
      }
      queryClient.setQueryData(['auth', 'me'], data)
      if (data.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear()
      navigate('/login')
    },
    onError: () => {
      queryClient.clear()
      navigate('/login')
    },
  })

  const resendVerificationMutation = useMutation({
    mutationFn: () => api.post('/auth/resend-verification'),
  })

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isGroupAdmin: user?.role === 'admin' || user?.groupRole === 'owner' || user?.groupRole === 'admin',
    emailVerified: user?.emailVerified ?? true, // true for admin (no email)
    login: loginMutation.mutate,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
    resendVerification: resendVerificationMutation.mutate,
    isResending: resendVerificationMutation.isPending,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/hooks/useAuth.ts
git commit -m "refactor: update useAuth for new auth model — email login, emailVerified, groupRole"
```

---

## Task 15: Frontend — new pages

**Files:**
- Create: `packages/frontend/src/pages/Register.tsx`
- Create: `packages/frontend/src/pages/VerifyEmail.tsx`
- Create: `packages/frontend/src/pages/ForgotPassword.tsx`
- Create: `packages/frontend/src/pages/ResetPassword.tsx`
- Create: `packages/frontend/src/pages/PickGroup.tsx`

- [ ] **Step 1: Create Register.tsx**

```tsx
// packages/frontend/src/pages/Register.tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, AuthUser } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AVATAR_EMOJIS } from '@/lib/utils'
import { toast } from '@/hooks/useToast'

const AVATARS = Object.keys(AVATAR_EMOJIS)

export default function Register() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [groupName, setGroupName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [avatar, setAvatar] = useState('cat')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const registerMutation = useMutation({
    mutationFn: (data: object) => api.post<AuthUser>('/auth/register', data),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data)
      navigate('/dashboard')
      toast({ title: 'Welcome! Check your email to verify your account.' })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    setPasswordError('')
    registerMutation.mutate({ groupName, playerName, avatar, email, password })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--cobalt-light)] opacity-[0.08] blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 select-none">🃏</div>
          <h1 className="text-4xl font-bold text-[var(--cobalt)]">Continental</h1>
          <p className="text-sm text-muted-foreground tracking-widest uppercase mt-1">Create your group</p>
        </div>

        <div className="felt-card p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Group Name</Label>
              <Input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="The Card Sharks"
                required
                minLength={2}
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Your Name</Label>
              <Input
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Alice"
                required
                minLength={2}
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Avatar</Label>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAvatar(key)}
                    className={`h-10 rounded-lg text-xl flex items-center justify-center border-2 transition-all ${
                      avatar === key
                        ? 'border-[var(--cobalt)] bg-[rgba(37,99,235,0.08)]'
                        : 'border-border hover:border-[rgba(37,99,235,0.3)]'
                    }`}
                  >
                    {AVATAR_EMOJIS[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{passwordError}</p>
            )}

            <Button type="submit" className="w-full h-11 mt-2" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Creating…' : 'Create Group'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--cobalt)] hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create VerifyEmail.tsx**

```tsx
// packages/frontend/src/pages/VerifyEmail.tsx
import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/lib/api'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); return }

    api.post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/dashboard'), 2000)
      })
      .catch(() => setStatus('error'))
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="felt-card p-12 text-center max-w-sm w-full">
        {status === 'loading' && <p className="text-muted-foreground">Verifying…</p>}
        {status === 'success' && (
          <>
            <p className="text-4xl mb-4">✅</p>
            <p className="font-semibold text-lg">Email verified!</p>
            <p className="text-muted-foreground text-sm mt-1">Redirecting to dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-4xl mb-4">❌</p>
            <p className="font-semibold">Link expired or invalid</p>
            <Link to="/dashboard" className="text-sm text-[var(--cobalt)] hover:underline mt-3 block">
              Go to dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ForgotPassword.tsx**

```tsx
// packages/frontend/src/pages/ForgotPassword.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', { email }),
    onSuccess: () => setSent(true),
  })

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="felt-card p-10 text-center max-w-sm w-full">
          <p className="text-3xl mb-4">📧</p>
          <p className="font-semibold">Check your email</p>
          <p className="text-sm text-muted-foreground mt-2">
            If that address is registered, you'll receive a reset link shortly.
          </p>
          <Link to="/login" className="text-sm text-[var(--cobalt)] hover:underline mt-4 block">
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">Forgot password?</h1>
        </div>
        <div className="felt-card p-8 space-y-5">
          <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="text-[var(--cobalt)] hover:underline">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create ResetPassword.tsx**

```tsx
// packages/frontend/src/pages/ResetPassword.tsx
import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/useToast'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const token = params.get('token') ?? ''

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password }),
    onSuccess: () => {
      toast({ title: 'Password updated. Please sign in.' })
      navigate('/login')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    mutation.mutate()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">New password</h1>
        </div>
        <div className="felt-card p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">New Password</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Confirm Password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-[hsl(var(--secondary))] border-[var(--border-color)] h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={mutation.isPending || !token}>
              {mutation.isPending ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create PickGroup.tsx**

```tsx
// packages/frontend/src/pages/PickGroup.tsx
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { api, AuthUser } from '@/lib/api'
import { toast } from '@/hooks/useToast'

export default function PickGroup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user } = useQuery<AuthUser>({ queryKey: ['auth', 'me'] })

  const switchMutation = useMutation({
    mutationFn: (groupId: string) => api.post<AuthUser>('/auth/switch-group', { groupId }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data)
      navigate('/dashboard')
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const groups = user?.groups ?? []

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold text-[var(--cobalt)]">Pick a group</h1>
          <p className="text-sm text-muted-foreground mt-1">You belong to multiple groups</p>
        </div>
        <div className="space-y-2">
          {groups.map(g => (
            <button
              key={g.groupId}
              onClick={() => switchMutation.mutate(g.groupId)}
              disabled={switchMutation.isPending}
              className="w-full felt-card p-4 text-left hover:border-[rgba(37,99,235,0.3)] transition-all"
            >
              <p className="font-semibold">{g.groupName}</p>
              <p className="text-xs text-muted-foreground">{g.groupRole}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/pages/Register.tsx packages/frontend/src/pages/VerifyEmail.tsx packages/frontend/src/pages/ForgotPassword.tsx packages/frontend/src/pages/ResetPassword.tsx packages/frontend/src/pages/PickGroup.tsx
git commit -m "feat: add Register, VerifyEmail, ForgotPassword, ResetPassword, PickGroup pages"
```

---

## Task 16: Update Login.tsx, Layout.tsx, App.tsx

**Files:**
- Modify: `packages/frontend/src/pages/Login.tsx`
- Modify: `packages/frontend/src/components/Layout.tsx`
- Modify: `packages/frontend/src/App.tsx`

- [ ] **Step 1: Update Login.tsx**

Change `username` state to `email`, change label to "Email", add forgot password and register links, update `login()` call to pass `email`:

Key changes:
1. `const [username, setUsername] = useState('')` → `const [email, setEmail] = useState('')`
2. Label `Group` → `Email`
3. Input type `text` → `email`, value `username` → `email`, onChange `setUsername` → `setEmail`, placeholder `your-group` → `you@example.com`
4. `login({ username, password })` → `login({ email, password })`
5. Add below the form: forgot password link and create group link

Add after `</Button>` and before `</form>`:
```tsx
<div className="flex justify-between text-xs text-muted-foreground mt-1">
  <Link to="/forgot-password" className="hover:text-[var(--cobalt)] transition-colors">
    Forgot password?
  </Link>
  <Link to="/register" className="hover:text-[var(--cobalt)] transition-colors">
    Create a group →
  </Link>
</div>
```

Also add `import { Link } from 'react-router-dom'` at top.

- [ ] **Step 2: Update Layout.tsx — add unverified email banner**

Import `useAuth` and add banner below the `<header>` tag:

```tsx
// In Layout.tsx, after the header closing tag:
const { user, emailVerified, resendVerification, isResending } = useAuth()
// ...
// After </header> opening of main:
{user?.role === 'user' && !emailVerified && (
  <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between gap-4">
    <p className="text-xs text-yellow-800">Please verify your email address.</p>
    <button
      onClick={() => resendVerification()}
      disabled={isResending}
      className="text-xs text-yellow-700 font-medium hover:underline flex-shrink-0"
    >
      {isResending ? 'Sending…' : 'Resend →'}
    </button>
  </div>
)}
```

- [ ] **Step 3: Update App.tsx — add new public routes**

Add imports for new pages and add public routes:

```tsx
import Register from '@/pages/Register'
import VerifyEmail from '@/pages/VerifyEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import PickGroup from '@/pages/PickGroup'
```

In the `<Routes>` block, after `/login`:
```tsx
<Route path="/register" element={<Register />} />
<Route path="/verify-email" element={<VerifyEmail />} />
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
<Route path="/pick-group" element={<PickGroup />} />
```

Also update `AppRoot` — allow access to `/register` without auth by checking current path:
```tsx
// AppRoot: if not loading and no user, redirect to login (not register — register is already public)
if (!user) return <Navigate to="/login" replace />
```
This is already correct since `/register` is a separate route not under `AppRoot`.

- [ ] **Step 4: Update ProtectedRoute — allow email-unverified users**

The `ProtectedRoute` currently checks `user.role !== 'admin'` to redirect admins to `/admin`. No change needed — unverified users are still allowed through (the banner handles that case).

However, the current check `user.role === 'admin'` will no longer match `role: 'group'` — it now checks against `role: 'user'`. Update the check:

In `ProtectedRoute.tsx`, `if (!adminOnly && user.role === 'admin')` — this was already checking the right thing. With new shape `role: 'user'` for group users, this logic still works correctly (`user.role === 'admin'` redirects admins, and `user.role === 'user'` passes through for non-admin routes).

No changes needed in ProtectedRoute.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/Login.tsx packages/frontend/src/components/Layout.tsx packages/frontend/src/App.tsx
git commit -m "feat: update Login (email field, forgot/register links), add unverified banner, add new routes"
```

---

## Task 17: Fix frontend tests for new auth shape

**Files:**
- Modify: `packages/frontend/src/hooks/__tests__/useAuth.test.tsx`
- Modify: `packages/frontend/src/pages/__tests__/Admin.test.tsx`
- Modify: `packages/frontend/src/pages/__tests__/Dashboard.liveGames.test.tsx`
- Modify: `packages/frontend/src/pages/__tests__/SeasonDetail.standings.test.tsx`
- Other failing frontend tests as needed

- [ ] **Step 1: Run frontend tests to see failures**

```bash
npm test -- --run packages/frontend 2>&1 | grep -E "(FAIL|✗)" | head -30
```

- [ ] **Step 2: Update useAuth.test.tsx**

The mock for `api.get('/auth/me')` should return the new `AuthUser` shape. Update mock responses:
- Old: `{ role: 'group', groupId: '...', groupAccess: 'admin', ... }`
- New: `{ role: 'user', userId: 'u1', groupId: '...', groupRole: 'owner', emailVerified: true, ... }`

- [ ] **Step 3: Update Admin.test.tsx**

The admin test mocks `useAuth` — update the mock to return `{ role: 'admin', username: 'admin' }` shape (unchanged).

- [ ] **Step 4: Update Dashboard.liveGames.test.tsx and SeasonDetail.standings.test.tsx**

These use `renderWithProviders` and mock `useAuth` to return `{ isGroupAdmin: true }`. The hook return value now includes `emailVerified` — add it to mocks to avoid undefined issues.

- [ ] **Step 5: Run frontend tests again**

```bash
npm test -- --run packages/frontend 2>&1 | tail -20
```

Expected: 0 failures

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/
git commit -m "test: update frontend tests for new AuthUser shape"
```

---

## Task 18: Full test run + verification

- [ ] **Step 1: Run all tests**

```bash
cd /Users/andresbenito/Documents/claude/continental/.worktrees/auth-rewrite
npm test -- --run 2>&1 | tail -30
```

Expected: 0 failures across backend and frontend

- [ ] **Step 2: Fix any remaining failures**

Use systematic-debugging skill if needed. Common issues:
- Prisma mock missing a method used by a route
- TypeScript type error in a test file
- Import path issues

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve remaining test failures after auth rewrite"
```

---

## Task 19: Seed update + env vars doc

- [ ] **Step 1: Verify seed.ts still works (no change needed)**

seed.ts only seeds Admin — it doesn't touch Group/Player/User. No changes required.

- [ ] **Step 2: Document required env vars in .env.example**

Add to `.env.example` (or create if not present):
```
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@continental.app
FRONTEND_URL=http://localhost:5173
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add Resend env vars to .env.example"
```
