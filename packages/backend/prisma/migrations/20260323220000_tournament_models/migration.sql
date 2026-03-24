-- Enums
CREATE TYPE "TournamentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "TableStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- Tournament
CREATE TABLE "Tournament" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "groupId"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "status"    "TournamentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tournament_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE
);

-- TournamentParticipant
CREATE TABLE "TournamentParticipant" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "playerId"     TEXT NOT NULL,
  CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE,
  CONSTRAINT "TournamentParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_playerId_key" ON "TournamentParticipant"("tournamentId", "playerId");

-- TournamentStage
CREATE TABLE "TournamentStage" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tournamentId"    TEXT NOT NULL,
  "stageNumber"     INTEGER NOT NULL,
  "startRound"      INTEGER NOT NULL,
  "endRound"        INTEGER NOT NULL,
  "advancePerTable" INTEGER NOT NULL,
  "status"          "StageStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "TournamentStage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TournamentStage_tournamentId_stageNumber_key" ON "TournamentStage"("tournamentId", "stageNumber");

-- TournamentTable
CREATE TABLE "TournamentTable" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "stageId"     TEXT NOT NULL,
  "tableNumber" INTEGER NOT NULL,
  "gameId"      TEXT,
  "status"      "TableStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "TournamentTable_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE,
  CONSTRAINT "TournamentTable_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id")
);
CREATE UNIQUE INDEX "TournamentTable_gameId_key" ON "TournamentTable"("gameId");
CREATE UNIQUE INDEX "TournamentTable_stageId_tableNumber_key" ON "TournamentTable"("stageId", "tableNumber");

-- TournamentTablePlayer
CREATE TABLE "TournamentTablePlayer" (
  "id"       TEXT NOT NULL PRIMARY KEY,
  "tableId"  TEXT NOT NULL,
  "playerId" TEXT,
  "isBye"    BOOLEAN NOT NULL DEFAULT false,
  "advanced" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "TournamentTablePlayer_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "TournamentTable"("id") ON DELETE CASCADE,
  CONSTRAINT "TournamentTablePlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TournamentTablePlayer_tableId_playerId_key" ON "TournamentTablePlayer"("tableId", "playerId");
