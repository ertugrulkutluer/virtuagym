/*
  Warnings:

  - You are about to drop the `ModelMetric` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PredictionLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ModelMetric";

-- DropTable
DROP TABLE "PredictionLog";

-- CreateTable
CREATE TABLE "AiDecisionLog" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "expectedAttendance" DOUBLE PRECISION NOT NULL,
    "overbookAllowed" BOOLEAN NOT NULL,
    "riskBand" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDecisionLog_classId_createdAt_idx" ON "AiDecisionLog"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "AiDecisionLog_createdAt_idx" ON "AiDecisionLog"("createdAt");
