-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proactive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Embedding_userId_model_idx" ON "Embedding"("userId", "model");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_sourceType_sourceId_key" ON "Embedding"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


