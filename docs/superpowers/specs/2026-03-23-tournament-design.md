# Tournament Feature Design

**Date:** 2026-03-23
**Status:** Approved for implementation

---

## Goal

Add a standalone tournament mode to Continental. Groups can run multi-stage pool tournaments: players are split into tables, the top scorers advance each round, until one final table decides the winner.

---

## Scope

- Tournament creation wizard (4 steps)
- Server-side bracket algorithm
- Per-stage Continental round configuration
- Active tournament view with table status and scores
- Admin confirmation flow between stages
- Integration with existing Game model for scoring

Out of scope: tournament history/stats, elimination/bracket visualisation beyond the active view, public-facing tournament pages.

---

## Tournament Format

A tournament is a series of **stages**. Each stage consists of multiple tables playing simultaneously. After all tables in a stage finish, an admin reviews scores and confirms advancement to the next stage. This repeats until one final table remains.

### Table constraints

- Minimum 3 players per table
- Maximum 6 players per table
- Preferred size: 4–5 players

### Scoring and advancement

Players advance based on total points accumulated in that stage's game (lowest score wins, consistent with Continental rules). The same number of players advance from every table in a stage. Ties are broken by the existing game scoring rules.

### Continental rounds per stage

Each stage is configured with a `startRound` and `endRound` (1–7). Early stages typically play a subset (e.g. rounds 5–7); the final typically plays all 7. This is configured in wizard step 3.

---

## Bracket Algorithm

Runs server-side when the tournament is created. Input: total player count. Output: ordered array of stages, each with `{ tableCount, playersPerTable, advancePerTable }`.

**Approach:** iteratively split the current player pool into tables of 4–5, falling back to 3 or 6 if no exact fit. If no valid exact split exists, pad the count to the nearest valid number (phantom "bye" players are auto-eliminated). Repeat until one table remains (the final).

**Example — 12 players:**
- Stage 1: 3 tables × 4 players, 2 advance each → 6 players
- Final: 1 table × 6 players

**Example — 13 players:**
- Pad to 15 (nearest valid)
- Stage 1: 3 tables × 5 players, 2 advance each → 6 players
- Final: 1 table × 6 players
- 2 bye slots assigned randomly (auto-eliminated at end of stage 1)

The algorithm is deterministic and unit-tested. The proposed structure is shown to the user in wizard step 2 before confirmation.

---

## Data Model

### New models

```prisma
model Tournament {
  id         String            @id @default(uuid())
  groupId    String
  group      Group             @relation(fields: [groupId], references: [id], onDelete: Cascade)
  name       String
  status     TournamentStatus  @default(DRAFT)
  createdAt  DateTime          @default(now())

  participants TournamentParticipant[]
  stages       TournamentStage[]
}

enum TournamentStatus {
  DRAFT
  IN_PROGRESS
  COMPLETED
}

model TournamentParticipant {
  id           String     @id @default(uuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  playerId     String
  player       Player     @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, playerId])
}

model TournamentStage {
  id           String        @id @default(uuid())
  tournamentId String
  tournament   Tournament    @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  stageNumber  Int
  startRound   Int           // 1–7
  endRound     Int           // 1–7, must be >= startRound
  status       StageStatus   @default(PENDING)

  tables TournamentTable[]

  @@unique([tournamentId, stageNumber])
}

enum StageStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

model TournamentTable {
  id          String        @id @default(uuid())
  stageId     String
  stage       TournamentStage @relation(fields: [stageId], references: [id], onDelete: Cascade)
  tableNumber Int
  gameId      String?       @unique
  game        Game?         @relation(fields: [gameId], references: [id])
  status      TableStatus   @default(PENDING)

  players TournamentTablePlayer[]

  @@unique([stageId, tableNumber])
}

enum TableStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

model TournamentTablePlayer {
  id       String          @id @default(uuid())
  tableId  String
  table    TournamentTable @relation(fields: [tableId], references: [id], onDelete: Cascade)
  playerId String
  player   Player          @relation(fields: [playerId], references: [id], onDelete: Cascade)
  isBye    Boolean         @default(false)  // phantom player, auto-eliminated
  advanced Boolean         @default(false)

  @@unique([tableId, playerId])
}
```

### Existing model change

Add `startRound` and `endRound` to `Game` (both nullable; null = standard 7-round game). The close-game guard uses `endRound ?? 7` as the required round count.

```prisma
model Game {
  // ... existing fields ...
  startRound Int?   // null = 1
  endRound   Int?   // null = 7
}
```

`Group` gains `tournaments Tournament[]`.
`Player` gains `tournamentParticipants TournamentParticipant[]` and `tournamentTablePlayers TournamentTablePlayer[]`.

---

## API Routes

All routes require `requireGroup`. Write operations require `requireGroupAdmin`.

### `POST /api/tournaments`

Creates a tournament. Body: `{ name, playerIds, stages: [{ startRound, endRound }] }`.

The `stages` array provides the round config per stage (in order). The bracket structure (table count, players per table, advancement) is computed server-side from `playerIds.length` — the client does not send it.

Response: full tournament object with stages, tables, and player assignments.

### `GET /api/tournaments`

Lists all tournaments for the group (name, status, createdAt, player count).

### `GET /api/tournaments/:id`

Full tournament detail: stages with tables, each table with players and (if game exists) current scores.

### `POST /api/tournaments/:id/stages/:stageId/advance`

Admin confirms advancement for a completed stage. Server:
1. Validates all tables in the stage have a completed game
2. Ranks players per table by total score (ascending)
3. Marks top N as `advanced = true` on `TournamentTablePlayer`
4. Creates the next stage's `TournamentTable` and `TournamentTablePlayer` records (shuffling advanced players across tables)
5. If this was the last stage before the final, creates the final stage
6. Marks current stage as `COMPLETED`, next stage as `IN_PROGRESS`

Returns updated tournament detail.

---

## Wizard (Frontend)

Four-step form at `/tournaments/new`:

**Step 1 — Name & Players**
Tournament name (required). Multi-select from group's active non-invited players. Shows avatar + name + role badge. Minimum 3 players required.

**Step 2 — Review Bracket**
Calls `GET /api/tournaments/bracket-preview?playerCount=N` (or computes client-side). Displays proposed stages as a visual diagram — tables per stage, players per table, how many advance. Read-only; user confirms or goes back.

**Step 3 — Configure Rounds Per Stage**
For each stage returned by the algorithm, show a row with toggle buttons R1–R7. Default: earlier stages play rounds 5–7, final plays all 7. User can adjust any stage.

**Step 4 — Review & Start**
Summary of everything. "Start Tournament" submits `POST /api/tournaments` and redirects to `/tournaments/:id`.

---

## Active Tournament View (`/tournaments/:id`)

- Header: tournament name, status badge, stage progress (e.g. "Round 1 of 2 · Rounds 5–7")
- Stage progress strip: completed stages greyed, current stage highlighted, future stages dashed
- Tables section: one card per table in the current stage
  - **Pending:** player list, no scores
  - **In Progress:** player list, "Round N/M" status badge, no final scores yet
  - **Completed:** ranked player list with scores, top N shown in green with "↑ advances" label
- Advancement banner: appears when all tables in a stage are completed. Shows "Review & Release [next stage]" button. Clicking shows a confirmation modal with the full advancement list before committing.

---

## Tournament List (`/tournaments`)

Linked from the main nav (same level as Seasons). Shows a card per tournament: name, status badge, player count, creation date. "New Tournament" button in header (admin only).

---

## Error Handling

- Bracket algorithm fails to find valid config: surface an error message in wizard step 2 with the minimum/maximum valid player counts nearest to the selected count
- Advancing before all games complete: 400 with clear message
- Game score tie at advancement boundary: advance both players (table gets one extra seat in next stage)

---

## Testing

- Unit tests for bracket algorithm covering: clean divides (12→final of 6), non-clean divides (13→pad to 15), edge cases (3 players = immediate final, 6 players = immediate final, 7 players = needs 2 stages)
- Route tests: create tournament, get detail, advance stage (happy path + errors)
- Frontend tests: wizard step navigation, bracket preview rendering, advancement confirmation modal
