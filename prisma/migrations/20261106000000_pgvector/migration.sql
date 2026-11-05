-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "Embedding" DROP COLUMN "vector",
ADD COLUMN     "embedding" vector(384);


-- Approximate nearest-neighbour index (HNSW) for cosine distance (`<=>`).
-- Not expressible in the Prisma schema; scripts/check-schema-drift.js knows about it.
CREATE INDEX "Embedding_embedding_hnsw_idx" ON "Embedding" USING hnsw ("embedding" vector_cosine_ops);
