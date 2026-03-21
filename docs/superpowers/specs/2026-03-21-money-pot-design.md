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

- `POST /api/admin/groups` — accept optional `currency` field (GBP/EUR/USD); DB default is EUR
- `PATCH /api/admin/groups/:id` — accept `currency` as an editable field alongside name and passwords
- `GET /api/auth/me` — add `currency` to the response payload so the frontend knows the group's currency without an additional fetch

### 2b. Season creation (`seasons.ts`)

- `POST /api/seasons` — accept `potEnabled: boolean` (default false) and `contributionAmount: number`
  - If `potEnabled: true` and `contributionAmount` is missing or ≤ 0 → return 400
  - If `potEnabled: false` → ignore any `contributionAmount` provided
- `GET /api/seasons` and season detail — include `potEnabled` and `contributionAmount` in all season responses

### 2c. Game creation (`games.ts`)

- `POST /api/seasons/:seasonId/games` — if the season has `potEnabled: true`, compute and store:
  ```
  totalPot = playerIds.length × contributionAmount
  ```
  If pot is disabled, `totalPot` remains null.

### 2d. Game close (`games.ts`)

After the existing 7-round check, if `game.totalPot` is set:

1. Sum round scores per player to determine winner(s) (lowest total = winner, matching existing standings logic)
2. Compute each player's net for this game:
   ```
   winnerShare = totalPot / winnerCount   (rounded to 2dp)

   winner  → potAwarded = winnerShare - contributionAmount
   loser   → potAwarded = -contributionAmount
   ```
3. Write `potAwarded` to **all** `GamePlayer` rows for this game (winners and losers)

If `game.totalPot` is null, `potAwarded` remains null on all rows — no financial tracking for pot-disabled games.

### 2e. Standings endpoint (`seasons.ts`)

- `GET /api/seasons/:id/standings` — extend each standing entry with:
  ```
  totalEarnings: SUM(GamePlayer.potAwarded)
    WHERE GamePlayer.game.seasonId = seasonId
    AND   GamePlayer.playerId = playerId
  ```
  Returns `0` (not null) for players who have no pot-awarded rows. Only meaningful when `season.potEnabled` is true; included in the response regardless so the frontend can decide whether to display it.

---

## 3. Frontend

### 3a. `api.ts` — type updates

```ts
interface AuthUser {
  // existing...
  currency?: 'GBP' | 'EUR' | 'USD'
}

interface Group {
  // existing...
  currency: 'GBP' | 'EUR' | 'USD'
}

interface Season {
  // existing...
  potEnabled: boolean
  contributionAmount?: number | null
}

interface Game {
  // existing...
  totalPot?: number | null
}

interface GamePlayer {
  // existing...
  potAwarded?: number | null
}

interface Standing {
  // existing...
  totalEarnings: number
}
```

Currency symbol helper:
```ts
const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' }
```

### 3b. `Admin.tsx` — group management

- Group creation form: add a currency selector (£ GBP / € EUR / $ USD), defaulting to EUR
- Group list: show currency badge (e.g. `€`) next to each group name
- Group edit dialog: allow changing currency alongside name and password

### 3c. `Seasons.tsx` — new season dialog

- Add a "Money Pot" toggle (default off)
- When toggled on: reveal a contribution amount numeric input prefixed with the group's currency symbol (from `auth/me`)
- Client-side validation: amount is required and must be > 0 when pot is enabled
- Submit payload: `{ name, potEnabled, contributionAmount? }`

### 3d. `SeasonDetail.tsx` — earnings leaderboard

- If `season.potEnabled`, render an **Earnings Leaderboard** section at the top of the page, above the existing standings
- Heading: `"Earnings"` with the pot amount shown as a sub-label (e.g. `"£5 per game"`)
- Rows ranked by `totalEarnings` descending (highest net earner first)
- Each row: rank, avatar, player name, formatted net earnings
  - Positive: green, e.g. `+£15.00`
  - Negative: muted/red, e.g. `-£5.00`
  - Zero: neutral, `£0.00`
- Only show players who have played at least one game in the season

---

## 4. Testing

### Backend

| Test | Expectation |
|------|-------------|
| `POST /api/admin/groups` with `currency: 'GBP'` | Stored correctly |
| `POST /api/admin/groups` without currency | Defaults to EUR |
| `PATCH /api/admin/groups/:id` with `currency: 'USD'` | Updated correctly |
| `GET /api/auth/me` after login | Returns `currency` on group user |
| `POST /api/seasons` with `potEnabled: true, contributionAmount: 5` | Season created with both fields |
| `POST /api/seasons` with `potEnabled: true`, no amount | Returns 400 |
| `POST /api/seasons` with `potEnabled: true, contributionAmount: 0` | Returns 400 |
| `POST /api/seasons` with `potEnabled: false` | `contributionAmount` stays null |
| Game creation in pot-enabled season (3 players, £5) | `totalPot = £15.00` |
| Game creation in pot-disabled season | `totalPot = null` |
| Game close, pot enabled, single winner | Winner: `+£10`, losers: `-£5` each |
| Game close, pot enabled, 2-way tie (3 players, £5) | Each winner: `+£2.50`, loser: `-£5` |
| Game close, pot disabled | All `potAwarded` remain null |
| Standings endpoint, pot enabled | `totalEarnings` correct across multiple games |

### Frontend

| Test | Expectation |
|------|-------------|
| New season dialog — pot toggle off by default | Amount input not visible |
| New season dialog — toggle on | Amount input appears with correct currency symbol |
| New season dialog — submit with pot on, no amount | Blocked by validation |
| SeasonDetail — `potEnabled: true` | Earnings leaderboard rendered above standings |
| SeasonDetail — `potEnabled: false` | Earnings leaderboard not rendered |
| Earnings leaderboard | Positive earnings green, negative muted |

---

## 5. Out of Scope

- Changing `contributionAmount` after a season is created
- Displaying per-game pot breakdown in game history
- Multi-currency seasons
- Pot carry-over between seasons
