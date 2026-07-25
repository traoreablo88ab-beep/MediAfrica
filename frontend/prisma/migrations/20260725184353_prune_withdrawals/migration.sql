-- DropForeignKey
ALTER TABLE "Withdrawal" DROP CONSTRAINT "Withdrawal_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "withdrawalPinHash";

-- DropTable
DROP TABLE "Withdrawal";
