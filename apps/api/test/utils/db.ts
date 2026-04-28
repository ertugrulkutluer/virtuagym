import { PrismaService } from "../../src/core/prisma/prisma.service";

/**
 * Truncates every domain table that test cases write to. Cheaper than
 * running migrations between specs and avoids cross-test bleed.
 *
 * Order matters only for tables without `ON DELETE CASCADE` — but Postgres
 * `TRUNCATE ... CASCADE` handles that for us.
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AttendanceLog",
      "CheckIn",
      "Booking",
      "CreditPack",
      "Class",
      "Trainer",
      "Member",
      "User",
      "AiDecisionLog",
      "BloodMarker",
      "BloodTestReport",
      "BloodworkAnalysisCache",
      "ProgramRecommendation"
    RESTART IDENTITY CASCADE
  `);
}
