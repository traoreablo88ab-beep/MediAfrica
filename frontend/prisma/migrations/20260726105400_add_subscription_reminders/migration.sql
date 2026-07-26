-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "reminder3dSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder5dSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder7dSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderOverdueSentAt" TIMESTAMP(3);
