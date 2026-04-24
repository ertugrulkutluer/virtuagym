-- CreateEnum
CREATE TYPE "MarkerInterpretation" AS ENUM ('LOW', 'BORDERLINE_LOW', 'NORMAL', 'BORDERLINE_HIGH', 'HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ClassCategory" AS ENUM ('HIIT', 'CARDIO', 'STRENGTH', 'YOGA', 'MOBILITY', 'PILATES', 'CYCLING', 'RECOVERY');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('MANUAL', 'PDF_UPLOAD');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "category" "ClassCategory" NOT NULL DEFAULT 'CARDIO';

-- CreateTable
CREATE TABLE "BloodTestReport" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" "ReportSource" NOT NULL DEFAULT 'MANUAL',
    "collectedAt" TIMESTAMP(3),
    "labName" TEXT,
    "notes" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodTestReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloodMarker" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "interpretation" "MarkerInterpretation" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "BloodMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRecommendation" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "readinessScore" INTEGER NOT NULL,
    "recommendedCategories" "ClassCategory"[],
    "avoidCategories" "ClassCategory"[],
    "perMarker" JSONB NOT NULL,
    "weeklyPlan" TEXT NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BloodTestReport_memberId_createdAt_idx" ON "BloodTestReport"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "BloodMarker_reportId_idx" ON "BloodMarker"("reportId");

-- CreateIndex
CREATE INDEX "BloodMarker_canonicalName_idx" ON "BloodMarker"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRecommendation_reportId_key" ON "ProgramRecommendation"("reportId");

-- CreateIndex
CREATE INDEX "ProgramRecommendation_memberId_createdAt_idx" ON "ProgramRecommendation"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "BloodTestReport" ADD CONSTRAINT "BloodTestReport_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodMarker" ADD CONSTRAINT "BloodMarker_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "BloodTestReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRecommendation" ADD CONSTRAINT "ProgramRecommendation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRecommendation" ADD CONSTRAINT "ProgramRecommendation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "BloodTestReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
