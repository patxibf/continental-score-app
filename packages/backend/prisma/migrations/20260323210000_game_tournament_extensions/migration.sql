-- Make seasonId nullable
ALTER TABLE "Game" ALTER COLUMN "seasonId" DROP NOT NULL;

-- Add tournament-specific columns
ALTER TABLE "Game" ADD COLUMN "groupId"    TEXT;
ALTER TABLE "Game" ADD COLUMN "startRound" INTEGER;
ALTER TABLE "Game" ADD COLUMN "endRound"   INTEGER;

-- Add FK constraint for groupId
ALTER TABLE "Game" ADD CONSTRAINT "Game_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
