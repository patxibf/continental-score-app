-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('GBP', 'EUR', 'USD');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "totalPot" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "GamePlayer" ADD COLUMN     "potAwarded" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "contributionAmount" DECIMAL(10,2),
ADD COLUMN     "potEnabled" BOOLEAN NOT NULL DEFAULT false;
