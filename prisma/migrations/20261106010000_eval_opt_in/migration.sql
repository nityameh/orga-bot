-- AlterTable
ALTER TABLE "User" ADD COLUMN     "evalOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "traceId" TEXT;

