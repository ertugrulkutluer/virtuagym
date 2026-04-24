-- CreateTable
CREATE TABLE "BloodworkAnalysisCache" (
    "id" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodworkAnalysisCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BloodworkAnalysisCache_inputHash_key" ON "BloodworkAnalysisCache"("inputHash");

-- CreateIndex
CREATE INDEX "BloodworkAnalysisCache_createdAt_idx" ON "BloodworkAnalysisCache"("createdAt");
