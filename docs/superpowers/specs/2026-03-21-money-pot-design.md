# Money Pot & Group Currency — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Allow groups to configure a base currency and optionally enable a money pot per season. When the pot is enabled, every player contributes a fixed amount per game; the winner collects the net gain and losers are charged their contribution. A season-level Earnings Leaderboard tracks net winnings across all games.

---

## 1. Data Layer

### New enum

```prisma
enum Currency { GBP EUR USD }
```

### Schema changes

| Model | Field | Type | Notes |
|-------|-------|------|-------|
| `Group` | `currency` | `Currency @default(EUR)` | Non-nullable; existing rows backfilled to EUR |
| `Season` | `potEnabled` | `Boolean @default(false)` | Whether the pot is active for this season |
| `Season` | `contributionAmount` | `Decimal? @db.Decimal(10,2)` | Required when `potEnabled`; null otherwise |
| `Game` | `totalPot` | `Decimal? @db.Decimal(10,2)` | Gross pot = N × contributionAmount; null when pot disabled |
| `GamePlayer` | `potAwarded` | `Decimal? @db.Decimal(10,2)` | Net earnings for this player in this game; set on close |

### Migration

One migration file covering all five changes. The `ALTER TABLE "Group" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'EUR'` backfills existing rows safely.

---

## 2. Backend

### 2a. Group endpoints (`admin.ts`)

Auth guards are unchanged from existing routes: `requireAdmin` for all group management endpoints.

- `GET /api/admin/groups` — the existing query uses an explicit `select`; add `currency: true` to that select so the group list includes currency for badge rendering.
- `POST /api/admin/groups` — accept optional `currency` field (GBP/EUR/USD); DB default is EUR. Invalid currency string returns 400.
- `PATCH /api/admin/groups/:id` — accept `currency` as an editable field alongside name and passwords. Must be one of `GBP | EUR | USD`; invalid values return 400. Currency changes take effect immediately; existing season amounts are currency-agnostic numbers and will be relabelled with the new symbol on the frontend. This is known and accepted behaviour.
- `GET /api/auth/me` — add `currency?: 'GBP' | 'EUR' | 'USD'` (optional) to the response. Present and non-null for group users (role: `'group'`); omitted for platform admins (role: `'admin'`). The existing query selects `{ id, name, username }` from Group — extend to include `currency`.

### 2b. Season endpoints (`seasons.ts`)

Auth guards unchanged: `requireGroup` for reads, `requireGroupAdmin` for writes.

**Creation — `POST /api/seasons`**

Use a dedicated `createSeasonSchema` (separate from the PATCH schema):
- Accept `name: string`, `potEnabled: boolean` (default false), `contributionAmount: number`
  - If `potEnabled: true` and `contributionAmount` is missing or ≤ 0 → return 400
  - If `potEnabled: true` and `contributionAmount` has more than 2 decimal places → return 400
  - `contributionAmount` maximum is 9999.99; values above return 400
  - If `potEnabled: false` → ignore any `contributionAmount` provided
- Response: full season object including `potEnabled` and `contributionAmount`

**Update — `PATCH /api/seasons/:id`**

Use a separate narrow `updateSeasonSchema` that accepts only `{ name: string }`. Do **not** reuse or extend the create schema. `potEnabled` and `contributionAmount` are immutable; any values sent are stripped by the schema (not an error).
- Response: the result of `prisma.season.update(...)`, which by default returns all scalar fields including `potEnabled` and `contributionAmount`. Do not add a `select` clause that would omit these fields. No extra re-fetch needed.

**List/Detail**
- `GET /api/seasons` uses `include: { _count: ... }`. Prisma returns all scalar fields automatically when `include` is used, so `potEnabled` and `contributionAmount` require **no change to the query** — they will appear in the response once the migration adds the columns.

**Decimal serialization:** Prisma serializes `Decimal` fields as **strings** in JSON (e.g. `"5.00"`). The frontend must use `parseFloat()` for arithmetic and display. This applies to `contributionAmount`, `totalPot`, and `potAwarded`.

### 2c. Game creation (`games.ts`)

Auth guard: `requireGroupAdmin` (unchanged).

- `POST /api/seasons/:seasonId/games` — if the season has `potEnabled: true` and `contributionAmount` is not null, compute and store:
  ```
  totalPot = playerIds.length × contributionAmount
  ```
  If pot is disabled or `contributionAmount` is null, `totalPot` remains null.

### 2d. Game close (`games.ts`)

Auth guard: `requireGroupAdmin` (unchanged).

The Prisma query for `POST /api/games/:id/close` must include:
```ts
include: {
  rounds: { include: { scores: true } },
  players: { include: { player: true } },
  season: { select: { contributionAmount: true } },
}
```

After the existing 7-round check, if `game.totalPot` is set **and** `game.season.contributionAmount` is not null:

1. Sum round scores per player to determine winner(s) (lowest total = winner, matching existing standings logic).
2. Compute each player's net for this game:
   ```
   contribution = parseFloat(game.season.contributionAmount.toString())
   totalPot     = parseFloat(game.totalPot.toString())
   // totalPot is the authoritative source for the pot size; contributionAmount is only used
   // for each player's individual net calculation.

   winnerShare = Math.floor((totalPot / winnerCount) * 100) / 100   ← truncate to 2dp, discard remainder

   winner  → potAwarded = winnerShare - contribution
   loser   → potAwarded = -contribution
   ```
   **Full-table tie** (all players equal score): every player is a winner, `winnerShare = totalPot / N = contribution`, so `potAwarded = 0` for all. This is correct — nobody wins or loses money.
3. Write `potAwarded` to **all** `GamePlayer` rows and update the game status in a single `prisma.$transaction([...])`. Each player gets an individual `prisma.gamePlayer.update` call (since each value differs); wrap all updates + the final `prisma.game.update({ status: 'CLOSED' })` in one transaction to ensure atomicity. If any write fails, none are committed.
4. `potAwarded` is stored as a plain signed decimal string (e.g. `"10.00"` for a win, `"-5.00"` for a loss). The `+` prefix displayed in the UI is added by the frontend only.

**Defensive fallback:** if `game.totalPot` is set but `game.season.contributionAmount` is null (invalid DB state), skip pot settlement and close the game normally without writing `potAwarded`.

If `game.totalPot` is null, `potAwarded` remains null on all rows.

**Aborted/deleted games:** cascade-deleted `GamePlayer` rows require no extra cleanup. `potAwarded` is never set on in-progress games.

### 2e. Season close (`seasons.ts`)

Auth guard: `requireGroupAdmin` (unchanged).

The existing `POST /api/seasons/:id/close` uses `prisma.game.updateMany` to bulk-close in-progress games. **Replace this with a `findMany` + per-game loop** so that pot settlement can be applied where needed:

```ts
// 1. Find all in-progress games in this season
const inProgressGames = await prisma.game.findMany({
  where: { seasonId, status: 'IN_PROGRESS' },
  include: {
    rounds: { include: { scores: true } },
    players: { include: { player: true } },
    season: { select: { contributionAmount: true, potEnabled: true } },
  },
})

// 2. For each game, settle pot (if eligible) + close in a transaction
for (const game of inProgressGames) {
  await settleAndCloseGame(game)   // same logic as section 2d
}
```

**7-round rule for force-close:** only run pot settlement on games that have all 7 rounds complete. Games with fewer than 7 rounds are closed without writing `potAwarded` (it remains null).

Each game's settlement (potAwarded writes + status update) must be wrapped in `prisma.$transaction([...])`, same as section 2d. If settlement fails for one game, that game is not closed; the season close continues for remaining games and still marks the season as `CLOSED` at the end.

### 2f. Standings endpoint (`seasons.ts`)

Auth guard: `requireGroup` (unchanged).

`GET /api/seasons/:id/standings` — extend each standing entry with `totalEarnings`.

**Implementation:** extend the Prisma query to include `potAwarded` on `GamePlayer` rows within closed games. In the in-memory aggregation loop, accumulate per player:
```ts
const earnings: Record<string, number> = {}
for (const game of closedGames) {
  for (const gp of game.players) {
    if (gp.potAwarded !== null && gp.potAwarded !== undefined) {
      earnings[gp.playerId] = (earnings[gp.playerId] ?? 0)
        + parseFloat(gp.potAwarded.toString())
    }
  }
}
```
`potAwarded` is a Prisma `Decimal` object — call `.toString()` before `parseFloat()`. Serialize `totalEarnings` as a plain JS `number` in the response.

**Eligibility:** only players with at least one closed `GamePlayer` row are included in standings (consistent with existing behaviour). `totalEarnings = 0` means the player played closed games but did not win any pot, or pot is disabled for this season. Either way `0` is the correct value; the frontend uses `season.potEnabled` to decide whether the earnings column is meaningful.

---

## 3. Frontend

### 3a. `api.ts` — type updates

```ts
interface AuthUser {
  // existing...
  currency?: 'GBP' | 'EUR' | 'USD'   // optional; present for group users, absent for platform admins
}

interface Group {
  // existing...
  currency: 'GBP' | 'EUR' | 'USD'
}

interface Season {
  // existing...
  potEnabled: boolean
  contributionAmount?: string | null   // Decimal serialized as string by Prisma
}

interface Game {
  // existing...
  totalPot?: string | null             // Decimal serialized as string
}

interface GamePlayer {
  // existing...
  potAwarded?: string | null           // Decimal serialized as string; negative for losses
}

interface Standing {
  // existing...
  totalEarnings: number                // Always present; 0 when pot disabled or all losses
}
```

Currency symbol helper (add to `utils.ts`):
```ts
export const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' }
```

### 3b. `Admin.tsx` — group management

- Group creation form: add a currency selector (£ GBP / € EUR / $ USD), defaulting to EUR
- Group list: show currency badge (e.g. `€`) next to each group name
- Group edit dialog: allow changing currency alongside name and password

### 3c. `Seasons.tsx` — new season dialog

- Add a "Money Pot" toggle (default off)
- When toggled on: reveal a contribution amount numeric input prefixed with the group's currency symbol (from `user.currency` in `useAuth()`)
- Client-side validation: amount is required, must be > 0, and must have at most 2 decimal places; submit button disabled if invalid
- Submit payload: `{ name, potEnabled, contributionAmount? }`

### 3d. `SeasonDetail.tsx` — earnings leaderboard

- If `season.potEnabled`, render an **Earnings Leaderboard** section at the top of the page, above the existing standings
- Heading: `"Earnings"` with the pot amount shown as a sub-label (e.g. `"£5.00 per game"`)
- Source data: `standings` array (already fetched), sorted by `totalEarnings` descending
- Each row: rank, avatar, player name, formatted net earnings:
  - Positive: green, e.g. `+£15.00`
  - Negative: muted/red, e.g. `-£5.00`
  - Zero: neutral, `£0.00`
- Currency symbol comes from `user.currency` via `useAuth()`. If `user.currency` is undefined (platform admin role), fall back to `'€'` as the display symbol.
- When `season.potEnabled` is false: leaderboard is not rendered

---

## 4. Testing

### Backend

| Test | Setup | Expectation |
|------|-------|-------------|
| `POST /api/admin/groups` with `currency: 'GBP'` | — | Stored correctly |
| `POST /api/admin/groups` without currency | — | Defaults to EUR |
| `POST /api/admin/groups` with `currency: 'JPY'` | — | Returns 400 |
| `PATCH /api/admin/groups/:id` with `currency: 'USD'` | — | Updated correctly |
| `PATCH /api/admin/groups/:id` with `currency: 'XXX'` | — | Returns 400 |
| `GET /api/auth/me` after group login | — | Returns `currency` field (non-null string) |
| `GET /api/auth/me` after admin login | — | No `currency` field in response |
| `POST /api/seasons` pot enabled, amount 5 | — | Season created with `potEnabled: true, contributionAmount: "5.00"` |
| `POST /api/seasons` pot enabled, no amount | — | Returns 400 |
| `POST /api/seasons` pot enabled, amount 0 | — | Returns 400 |
| `POST /api/seasons` pot enabled, amount 5.555 | — | Returns 400 (>2dp) |
| `POST /api/seasons` pot enabled, amount 10000 | — | Returns 400 (exceeds max) |
| `POST /api/seasons` pot disabled | — | `contributionAmount` is null |
| `PATCH /api/seasons/:id` with `potEnabled: false` on pot-enabled season | — | `potEnabled` unchanged; response includes original values |
| Game creation, pot-enabled season, 3 players (£5) | — | `totalPot = "15.00"` on Game |
| Game creation, pot-disabled season | — | `totalPot = null` |
| Game close, pot enabled, 3 players (£5), single winner | Winner p1, losers p2/p3 | p1 `potAwarded = "10.00"`, p2/p3 `potAwarded = "-5.00"` |
| Game close, pot enabled, 3 players (£5), 2-way tie | Winners p1+p2, loser p3 | p1/p2 `potAwarded = "2.50"`, p3 `potAwarded = "-5.00"` |
| Game close, pot enabled, 4 players (£5), 3-way tie | Winners p1+p2+p3 (£5/player), loser p4 | `totalPot = "20.00"`, `winnerShare = 6.66` (truncated); p1/p2/p3 `potAwarded = "1.66"`, p4 `potAwarded = "-5.00"` |
| Game close, pot enabled, all players tie | All 3 players equal score (£5/player) | All `potAwarded = "0.00"` |
| Game close, pot disabled | — | All `potAwarded` remain null |
| Season close, pot-enabled season, in-progress game with 7 rounds | — | Force-closed game has `potAwarded` written to all `GamePlayer` rows |
| Season close, pot-enabled season, in-progress game with 5 rounds | — | Force-closed game has `potAwarded = null` on all rows (< 7 rounds) |
| Standings, pot enabled, 2 closed games | Player won game 1 (+10), lost game 2 (-5) | `totalEarnings = 5` |
| Standings, no closed games in pot-enabled season | All games in-progress | No players returned in standings |

### Frontend

| Test | Expectation |
|------|-------------|
| New season dialog, pot toggle off by default | Amount input not visible |
| New season dialog, toggle on | Amount input appears with correct currency symbol |
| New season dialog, submit with pot on and no amount | Submit disabled |
| SeasonDetail, `potEnabled: true`, standings present | Earnings leaderboard rendered above standings |
| SeasonDetail, `potEnabled: false` | Earnings leaderboard not rendered |
| Earnings leaderboard | Positive earnings green, negative muted/red, sorted descending |

---

## 5. Out of Scope

- Changing `potEnabled` or `contributionAmount` after a season is created
- Displaying per-game pot breakdown in game history
- Multi-currency seasons
- Pot carry-over between seasons
- Redistributing sub-cent rounding remainders in tie scenarios
- Restricting currency changes when active pot-enabled seasons exist
