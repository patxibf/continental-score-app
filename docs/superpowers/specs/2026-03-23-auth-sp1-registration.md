# Auth Rewrite — Sub-project 1: Self-Serve Registration & Foundation

**Date:** 2026-03-23
**Status:** Approved

---

## Overview

Replace the admin-created shared-password group model with individual user accounts. Groups self-register via an email-verified signup flow. This is the foundation for player invitations (SP2) and role management (SP3).

All existing data is dropped. Fresh schema from scratch.

---

## 1. Data Layer

### Schema changes

**Drop:** `Group.passwordHash`, `Group.memberPasswordHash`
**Drop:** `GroupPlayer` (many-to-many) — replaced by `Player.userId`
**Drop:** `SeasonPlayer` — no longer needed (derived from GamePlayer)
**Keep:** `Admin`, `Season`, `Game`, `Round`, `RoundScore`, `GamePlayer`, `TelegramChat`, `TelegramUser`
**Keep:** `Group` — modified (add slug rename from username, drop password fields, drop ownerId as derived)

New models:

```prisma
model User {
  id            String      @id @default(uuid())
  email         String      @unique
  passwordHash  String
  emailVerified Boolean     @default(false)
  createdAt     DateTime    @default(now())

  players       Player[]
  tokens        AuthToken[]
}

enum TokenType { EMAIL_VERIFICATION PASSWORD_RESET }

model AuthToken {
  id        String    @id @default(uuid())
  token     String    @unique  // 32-byte random hex
  type      TokenType
  userId    String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Modified `Player` model — now the membership record:

```prisma
model Player {
  id        String    @id @default(uuid())
  groupId   String
  userId    String?   // null = invited but not yet claimed (SP2)
  name      String
  avatar    String    @default("cat")
  role      GroupRole @default(MEMBER)
  email     String?   // for pending invitations (SP2)
  active    Boolean   @default(true)
  createdAt DateTime  @default(now())

  user      User?     @relation(fields: [userId], references: [id])
  group     Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)

  gamePlayers GamePlayer[]

  @@unique([groupId, userId])
}

enum GroupRole { OWNER ADMIN MEMBER }
```

Modified `Group` model:

```prisma
model Group {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique   // URL/login handle, replaces username
  currency  Currency @default(EUR)
  createdAt DateTime @default(now())

  players   Player[]
  seasons   Season[]
}
```

`Season` gains a `groupId` relation directly (already exists). No other season/game changes.

### Migration strategy

Single migration that:
1. Drops `GroupPlayer`, `SeasonPlayer`
2. Drops `Group.passwordHash`, `Group.memberPasswordHash`, `Group.username`
3. Adds `Group.slug` (derived from existing `username` values if any)
4. Adds `User`, `AuthToken` tables
5. Adds `Player.userId`, `Player.role`, `Player.email` columns
6. Adds `GroupRole` enum

Since we're doing a fresh start, seed script is dropped. Platform admin seeded via env var as before.

---

## 2. Backend

### Email infrastructure

New package: `resend` (`npm install resend`)

New env vars:
```
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@continental.app
```

New module: `packages/backend/src/lib/mailer.ts`

```ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void>
export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void>
```

Templates are plain-text + simple HTML. Link base = `process.env.FRONTEND_URL`.

### Token helper

New module: `packages/backend/src/lib/tokens.ts`

```ts
import crypto from 'crypto'

export function generateToken(): string  // 32-byte hex
export async function createAuthToken(userId, type, expiryHours): Promise<string>
export async function consumeToken(token, type): Promise<{ userId: string } | null>
  // returns null if not found, expired, or already used
  // on success: sets usedAt = now()
```

### Auth routes (`packages/backend/src/routes/auth.ts`) — full rewrite

**POST `/api/auth/register`**

Body: `{ groupName: string, playerName: string, avatar: string, email: string, password: string }`

Validation:
- `email` valid format, not already registered → 400 `EMAIL_TAKEN`
- `password` min 8 chars → 400
- `groupName` 2–50 chars → 400
- `playerName` 2–50 chars → 400
- `avatar` one of the valid avatar keys → 400

Logic (single `prisma.$transaction`):
1. Hash password with bcrypt (cost 12)
2. Create `User` (emailVerified: false)
3. Generate unique `slug` from groupName
4. Create `Group`
5. Create `Player` (role: OWNER, userId: user.id)
6. Create `AuthToken` (type: EMAIL_VERIFICATION, expiry: 24h)
7. Send verification email (outside transaction, best-effort)
8. Issue JWT → set cookie

Response: `201` with `{ user, group }` (same shape as `/api/auth/me`)

**POST `/api/auth/verify-email`**

Body: `{ token: string }`

Logic:
1. `consumeToken(token, EMAIL_VERIFICATION)` → null → 400 `INVALID_TOKEN`
2. Set `User.emailVerified = true`
3. Re-issue JWT (emailVerified now true in payload if needed)

Response: `200 { message: 'Email verified' }`

**POST `/api/auth/resend-verification`**

Auth: requires logged-in user (any)

Logic:
1. If already verified → 400
2. Invalidate previous EMAIL_VERIFICATION tokens for this user (set usedAt)
3. Create new token, send email

Response: `200`

**POST `/api/auth/forgot-password`**

Body: `{ email: string }`

Logic:
1. Look up User by email — if not found, return `200` silently (no enumeration)
2. Invalidate previous PASSWORD_RESET tokens for this user
3. Create token (expiry: 1h), send email

Response: `200` always

**POST `/api/auth/reset-password`**

Body: `{ token: string, password: string }`

Validation: password min 8 chars

Logic:
1. `consumeToken(token, PASSWORD_RESET)` → null → 400 `INVALID_TOKEN`
2. Hash new password, update `User.passwordHash`

Response: `200`

**POST `/api/auth/login`** — rewritten

Body: `{ email: string, password: string, groupId?: string }`

Logic:
1. Try Admin by username (keep for platform admin — `email` field used as username)
2. Else find User by email → bcrypt compare → 401 if no match
3. Load `Player[]` for this user (with groupId)
4. If 0 groups → 403 `NO_GROUP` (edge case: verified but removed from all groups)
5. If 1 group → issue JWT for that group
6. If multiple groups + `groupId` provided → issue JWT for that group
7. If multiple groups, no `groupId` → return `200 { requiresGroupSelection: true, groups: [...] }`

JWT payload:
```ts
{ role: 'user'; userId: string; playerId: string; groupId: string; groupRole: 'owner' | 'admin' | 'member' }
```

Cookie: httpOnly, 7-day expiry (unchanged)

**POST `/api/auth/switch-group`**

Auth: requires logged-in user

Body: `{ groupId: string }`

Logic:
1. Verify user has a Player in that group → 403 if not
2. Issue new JWT for that group

**GET `/api/auth/me`** — updated

Returns:
```ts
{
  role: 'admin' | 'user'
  // if user:
  userId: string
  email: string
  emailVerified: boolean
  playerId: string
  groupId: string
  groupName: string
  groupSlug: string
  playerName: string
  playerAvatar: string
  groupRole: 'owner' | 'admin' | 'member'
  currency: 'GBP' | 'EUR' | 'USD'
  // if admin:
  adminId: string
  username: string
}
```

### Auth plugin (`packages/backend/src/plugins/auth.ts`) — updated guards

```ts
authenticate        // any logged-in entity (admin or user)
requireAdmin        // platform admin only
requireGroup        // any user with active group (replaces old requireGroup)
requireGroupAdmin   // groupRole === 'owner' || 'admin'
requireGroupOwner   // groupRole === 'owner' (SP3)
```

JWT verification reads new payload shape. Old `groupAccess` field replaced by `groupRole`.

### Admin routes (`packages/backend/src/routes/admin.ts`) — updated

- Remove `POST /api/admin/groups` (group creation is now self-serve)
- Keep `GET /api/admin/groups` (list all groups with member count)
- Keep `DELETE /api/admin/groups/:id`
- Remove `PATCH /api/admin/groups/:id` — currency changes move to group settings in SP3
- Add `GET /api/admin/groups/:id` for detail view

### Group routes — new file `packages/backend/src/routes/groups.ts`

```
GET  /api/groups/current          ← current group info (requireGroup)
PATCH /api/groups/current         { name?, currency? } (requireGroupAdmin)
```

### Slug generation

Reuse existing `nameToSlug` / `uniqueSlug` logic from admin.ts, moved to `packages/backend/src/lib/slug.ts`.

---

## 3. Frontend

### New pages

**`/register`** — `Register.tsx`
Fields: Group name, your name, avatar picker, email, password (min 8), confirm password
On submit: POST `/api/auth/register`
On success: redirect to `/dashboard` with a "Check your email to verify your account" banner
No login required to access.

**`/verify-email`** — `VerifyEmail.tsx`
Reads `?token=` from URL, POST `/api/auth/verify-email` on mount
Shows: loading → success "Email verified!" → error "Link expired or invalid"
Success: redirect to `/dashboard` after 2s

**`/forgot-password`** — `ForgotPassword.tsx`
Email input, always shows "If that email exists, you'll receive a reset link" on submit

**`/reset-password`** — `ResetPassword.tsx`
Reads `?token=` from URL, new password + confirm, POST `/api/auth/reset-password`
On success: redirect to `/login` with success message

**`/pick-group`** — `PickGroup.tsx`
Shown after login when user is in multiple groups
List of groups, click → POST `/api/auth/switch-group` → redirect to `/dashboard`

### Updated pages

**`Login.tsx`** — change username field to email; add "Forgot password?" link; add "Create a group →" link to `/register`

**`useAuth.ts` hook** — update to new me response shape; handle `requiresGroupSelection` response from login (redirect to `/pick-group`)

**`api.ts`** — update `AuthUser` interface to match new me shape; rename `username` → `groupSlug`; add `emailVerified`, `playerName`, `groupRole`

### Unverified email banner

In the main layout (`App.tsx` or layout component): if `user.emailVerified === false`, show a persistent yellow banner "Please verify your email. Resend →" with a button that calls POST `/api/auth/resend-verification`.

### Router updates

Add routes: `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/pick-group`
Public routes (no auth required): `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`

---

## 4. Testing

### Backend

| Test | Expectation |
|---|---|
| POST /api/auth/register — valid | 201, User + Group + Player(OWNER) created, email sent |
| POST /api/auth/register — duplicate email | 400 EMAIL_TAKEN |
| POST /api/auth/register — short password | 400 |
| POST /api/auth/register — invalid group name | 400 |
| POST /api/auth/verify-email — valid token | 200, emailVerified = true |
| POST /api/auth/verify-email — expired token | 400 INVALID_TOKEN |
| POST /api/auth/verify-email — already used | 400 INVALID_TOKEN |
| POST /api/auth/login — valid, single group | 200, JWT cookie set |
| POST /api/auth/login — valid, multiple groups, no groupId | 200 requiresGroupSelection |
| POST /api/auth/login — valid, multiple groups, groupId provided | 200, JWT for that group |
| POST /api/auth/login — wrong password | 401 |
| POST /api/auth/login — unknown email | 401 |
| POST /api/auth/forgot-password — unknown email | 200 (silent) |
| POST /api/auth/reset-password — valid token | 200, password updated |
| POST /api/auth/reset-password — expired token | 400 INVALID_TOKEN |
| GET /api/auth/me — user | correct shape with groupRole, emailVerified etc. |
| GET /api/auth/me — admin | correct admin shape |
| POST /api/auth/switch-group — valid | new JWT for that group |
| POST /api/auth/switch-group — group user not in | 403 |
| requireGroupAdmin — MEMBER calls admin route | 403 |
| requireGroupAdmin — OWNER calls admin route | 200 |
| requireGroupAdmin — ADMIN calls admin route | 200 |

### Frontend

| Test | Expectation |
|---|---|
| Register page renders | Group name, player name, avatar, email, password fields visible |
| Register — submit with mismatched passwords | Error shown, no submission |
| Register — submit valid | Calls POST /api/auth/register |
| Login page — email field | Label says Email not Group |
| Login page — forgot password link | Renders and navigates to /forgot-password |
| Unverified banner | Visible when emailVerified = false |
| Unverified banner | Hidden when emailVerified = true |

---

## 5. Out of Scope

- OAuth / social login
- Two-factor authentication
- Player invitations (SP2)
- Role management UI (SP3)
- Group deletion by owner (SP3)
- Admin route for creating groups (removed, not replaced)
