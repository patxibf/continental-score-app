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

Out of scope: tournament history/stats, elimination bracket visualisation beyond the active view, public-facing tournament pages.

---

## Tournament Format

A tournament is a series of **stages**. Each stage consists of multiple tables playing simultaneously. After all tables in a stage finish, an admin reviews scores and confirms advancement to the next stage. This repeats until one final table remains.

### Table constraints

- Minimum 3 players per table
- Maximum 6 players per table
- Preferred size: 4–5 players

### Scoring and advancement

Players advance based on total points accumulated in that stage's game (lowest score wins, consistent with Continental rules). The same number of players advance from every table in a stage (stored as `advancePerTable` on `TournamentStage`). In a tie at the advancement boundary, all tied players advance (the next stage receives extra players; see Tie Handling below).

### Continental rounds per stage

Each stage is configured with a `startRound` and `endRound` (1–7). Early stages typically play a subset (e.g. rounds 5–7); the final typically plays all 7. This is configured in wizard step 3.

---

## Bracket Algorithm

Runs server-side when the tournament is created. Input: total player count. Output: ordered array of stage descriptors, each with `{ tableCount, playersPerTable, advancePerTable }`.

**Approach:** iteratively split the current player pool into tables of 4–5, falling back to 3 or 6 if no exact fit. If no valid exact split exists, pad the count to the nearest valid number (phantom "bye" players are auto-eliminated). Repeat until one table remains (the final).

**advancePerTable** is chosen as the largest integer such that `tableCount × advancePerTable` is a valid input for the next stage (i.e. fits within table constraints). Typically 2.

**Example — 12 players:**
- Stage 1: 3 tables × 4 players, advancePerTable=2 → 6 players
- Final: 1 table × 6 players

**Example — 13 players:**
- Pad to 15
- Stage 1: 3 tables × 5 players, advancePerTable=2 → 6 players
- Final: 1 table × 6 players
- 2 bye slots assigned to random tables (auto-eliminated, `isBye=true`)

**Single-stage edge case:** if playerCount ≤ 6, the algorithm returns a single stage (the final). No advancement step is needed; closing that game marks the tournament `COMPLETED`.

The algorithm is deterministic and unit-tested. The client calls `GET /api/tournaments/preview?playerCount=N` to display the proposed structure in wizard step 2.

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
  id              String        @id @default(uuid())
  tournamentId    String
  tournament      Tournament    @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  stageNumber     Int
  startRound      Int           // 1–7
  endRound        Int           // 1–7, >= startRound
  advancePerTable Int           // how many players advance from each table; 0 for the final stage
  status          StageStatus   @default(PENDING)

  tables TournamentTable[]

  @@unique([tournamentId, stageNumber])
}

enum StageStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

model TournamentTable {
  id          String          @id @default(uuid())
  stageId     String
  stage       TournamentStage @relation(fields: [stageId], references: [id], onDelete: Cascade)
  tableNumber Int
  gameId      String?         @unique
  game        Game?           @relation(fields: [gameId], references: [id])
  status      TableStatus     @default(PENDING)

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
  playerId String?         // nullable: null for bye slots (at most one bye per table — see algorithm invariant)
  player   Player?         @relation(fields: [playerId], references: [id], onDelete: Cascade)
  isBye    Boolean         @default(false)
  advanced Boolean         @default(false)

  // The algorithm assigns at most one bye slot per table, so (tableId, NULL) appears at most once.
  // PostgreSQL treats NULLs as distinct in unique indexes, which is the correct behaviour here.
  @@unique([tableId, playerId])
}
```

### Existing model changes

**`Game` model:** add the following nullable fields:
- `startRound Int?` and `endRound Int?` (null = standard 1/7). The close-game guard must use `(endRound ?? 7) - (startRound ?? 1) + 1` as the required number of completed rounds. The `POST /api/games/:gameId/rounds` route must validate that `roundNumber` is between `startRound ?? 1` and `endRound ?? 7`, rejecting out-of-range round submissions with 400.
- `groupId String?` with a corresponding `Group?` relation. Tournament games set this directly (since `seasonId` is null). The existing game access guard currently checks `game.season.groupId`; it must be updated to use `game.groupId ?? game.season?.groupId` when `seasonId` is null.

`Game.seasonId` is currently non-nullable. Make it nullable (`String?`). Tournament games have `seasonId = null` and `groupId` set instead.

**`Group`** gains `tournaments Tournament[]`.

**`Player`** gains `tournamentParticipants TournamentParticipant[]` and `tournamentTablePlayers TournamentTablePlayer[]`.

---

## Next-Stage Table Creation

Tables for a stage are **not** created upfront at tournament creation. Only Stage 1 tables and player assignments are created when the tournament starts. Subsequent stages' tables are created by the `advance` endpoint at confirmation time. This allows tie handling to adjust player counts without conflicting with pre-allocated records.

The bracket algorithm output (shown in wizard step 2) is therefore a projection, not a guarantee — if a tie adds an extra player to a stage, the actual table configuration may differ slightly from what was previewed. The `advance` endpoint re-runs a local split of the advancing player pool to assign them to tables.

---

## Tie Handling

When multiple players tie at the advancement boundary, all tied players advance. The next stage receives the extra player(s). The `advance` endpoint re-splits the advancing pool across tables using the same algorithm (target 4–5, min 3, max 6), creating however many tables are needed.

---

## API Routes

All routes require `requireGroup`. Write operations require `requireGroupAdmin`.

### `GET /api/tournaments/preview?playerCount=N`

Returns the bracket algorithm output: `{ stages: [{ stageNumber, tableCount, playersPerTable, advancePerTable }] }`. Requires `requireGroup` (group member token). No admin required. Must be registered before `GET /api/tournaments/:id` to avoid the route parameter shadowing the static path segment.

### `POST /api/tournaments`

Creates a tournament. Body: `{ name, playerIds, stageConfigs: [{ startRound, endRound }] }`.

`stageConfigs` must have exactly as many entries as the bracket algorithm produces for `playerIds.length`. If the count mismatches, respond 400: `"stageConfigs length must match bracket stage count"`. The bracket structure is computed server-side; `stageConfigs` provides only the round range per stage.

Response: full tournament object with Stage 1 tables and player assignments. Tournament status set to `IN_PROGRESS`.

### `GET /api/tournaments`

Lists all tournaments for the group: id, name, status, playerCount, createdAt.

### `GET /api/tournaments/:id`

Full tournament detail: stages with tables, each table with players and (if game linked) current scores from the associated game.

### `POST /api/tournaments/:id/stages/:stageId/advance`

Admin confirms advancement for a completed **non-final** stage. Return 400 if called on the last stage (the final); final-stage completion is triggered automatically by the game-close hook (see Game Lifecycle section below).

Server steps:

1. Validates stage is not the final stage (`advancePerTable > 0`); return 400 otherwise
2. Validates all tables in the stage have status `COMPLETED`
3. Validates the stage is `IN_PROGRESS` and not already `COMPLETED`
4. Per table: fetch game totals, rank players ascending by total score, mark top `advancePerTable` as `advanced = true` (include all tied players at the boundary)
5. Collect all advancing players and re-split into next-stage tables using the bracket algorithm
6. Create `TournamentTable` and `TournamentTablePlayer` records for the next stage
7. Mark current stage `COMPLETED`, next stage `IN_PROGRESS`

Returns updated tournament detail.

---

## Game Lifecycle for Tournament Tables

Each `TournamentTable` links to one `Game`. The game is created with `startRound` and `endRound` from its parent `TournamentStage`, and `seasonId = null`. The game's `groupId` is derived from the tournament's `groupId`.

A tournament table game can be closed once it has `(endRound - startRound + 1)` completed rounds — not 7. The close-game route reads `startRound`/`endRound` from the game record.

When a game linked to a `TournamentTable` is closed, the table's status is set to `COMPLETED`. When all tables in a stage are `COMPLETED`, the advancement banner becomes active in the UI.

**Final stage completion:** if the closed table belongs to the final stage (`advancePerTable = 0`) and all tables in that stage are now `COMPLETED`, the game-close handler additionally sets `TournamentStage.status = COMPLETED` and `Tournament.status = COMPLETED`. No `advance` call is needed or permitted for the final stage.

---

## Wizard (Frontend)

Four-step form at `/tournaments/new`:

**Step 1 — Name & Players**
Tournament name (required). Multi-select from group's active non-invited players. Shows avatar + name + role badge. Minimum 3 players required.

**Step 2 — Review Bracket**
Client calls `GET /api/tournaments/preview?playerCount=N` and renders the proposed stage structure as a visual diagram (tables per stage, players per table, how many advance). Read-only; user confirms or goes back to adjust player selection.

**Step 3 — Configure Rounds Per Stage**
For each stage returned by the preview, show a row of toggle buttons R1–R7. Default: stages before the final play rounds 5–7; final plays all 7. User can adjust any stage. Validation: `startRound ≤ endRound`.

**Step 4 — Review & Start**
Full summary: player list, bracket diagram, rounds per stage. "Start Tournament" submits `POST /api/tournaments` and redirects to `/tournaments/:id`.

---

## Active Tournament View (`/tournaments/:id`)

- Header: tournament name, status badge, "Round N of M · Rounds X–Y"
- Stage progress strip: completed stages greyed, current highlighted, future dashed
- Tables section: one card per table in the current stage
  - **Pending:** player avatars/names, no scores
  - **In Progress:** player list, "Round N/M" status badge
  - **Completed:** ranked player list with total scores; top N shown in green with "↑ advances" indicator
- Advancement banner: appears when all tables in a stage are `COMPLETED`. "Review & Release [next stage]" button opens a confirmation modal showing who advances. Confirming calls `POST .../advance`.
- Single-stage tournament (≤ 6 players): no advancement banner; tournament is marked complete when the game closes.

---

## Tournament List (`/tournaments`)

Linked from the main nav alongside Seasons. Card per tournament: name, status badge, player count, creation date. "New Tournament" button (admin only).

---

## Error Handling

- Player count produces no valid bracket: surface error in wizard step 2 with the nearest valid counts below and above
- `stageConfigs` length mismatch on creation: 400
- Advance called before all tables complete: 400
- Advance called on already-completed stage: 400
- `roundNumber` out of game's `startRound`/`endRound` range: 400

---

## Testing

- Unit tests for bracket algorithm: clean divide (12→final of 6), non-clean (13→pad to 15), edge cases (3 players = immediate final, 6 = immediate final, 7 = 2 stages), tie-adjusted re-split
- Route tests: `preview`, `create` (happy + stageConfigs mismatch), `get detail`, `advance` (happy + not-all-tables-done + already-completed)
- Game route tests: close blocked until correct round count, round submission rejected outside startRound–endRound range
- Frontend tests: wizard step navigation, bracket preview rendering, advancement confirmation modal
