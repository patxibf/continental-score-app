-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "inviteExpiry" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN     "inviteToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_inviteToken_key" ON "Player"("inviteToken");
