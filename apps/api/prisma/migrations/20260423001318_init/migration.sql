-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'WAITLISTED', 'PROMOTED', 'CHECKED_IN', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('MANUAL', 'QR', 'AUTO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "tenureStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cohort" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trainer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "creditCost" INTEGER NOT NULL DEFAULT 1,
    "trainerId" TEXT,
    "location" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPack" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remainingCredits" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
    "creditCost" INTEGER NOT NULL,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waitlistPosition" INTEGER,
    "promotedFromWaitlistAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "showProbability" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "CheckInMethod" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "showed" BOOLEAN NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "showProbability" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelMetric" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "samples" INTEGER NOT NULL,
    "brierScore" DOUBLE PRECISION NOT NULL,
    "mae" DOUBLE PRECISION NOT NULL,
    "driftAlert" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_key" ON "Member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE INDEX "Member_email_idx" ON "Member"("email");

-- CreateIndex
CREATE INDEX "Class_startsAt_idx" ON "Class"("startsAt");

-- CreateIndex
CREATE INDEX "Class_trainerId_idx" ON "Class"("trainerId");

-- CreateIndex
CREATE INDEX "CreditPack_memberId_idx" ON "CreditPack"("memberId");

-- CreateIndex
CREATE INDEX "Booking_classId_status_idx" ON "Booking"("classId", "status");

-- CreateIndex
CREATE INDEX "Booking_memberId_status_idx" ON "Booking"("memberId", "status");

-- CreateIndex
CREATE INDEX "Booking_classId_waitlistPosition_idx" ON "Booking"("classId", "waitlistPosition");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_bookingId_key" ON "CheckIn"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceLog_bookingId_key" ON "AttendanceLog"("bookingId");

-- CreateIndex
CREATE INDEX "AttendanceLog_memberId_recordedAt_idx" ON "AttendanceLog"("memberId", "recordedAt");

-- CreateIndex
CREATE INDEX "AttendanceLog_classId_idx" ON "AttendanceLog"("classId");

-- CreateIndex
CREATE INDEX "PredictionLog_bookingId_idx" ON "PredictionLog"("bookingId");

-- CreateIndex
CREATE INDEX "PredictionLog_predictedAt_idx" ON "PredictionLog"("predictedAt");

-- CreateIndex
CREATE INDEX "ModelMetric_modelVersion_recordedAt_idx" ON "ModelMetric"("modelVersion", "recordedAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPack" ADD CONSTRAINT "CreditPack_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
