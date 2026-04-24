/**
 * Seeds realistic historical attendance so the Day 3 no-show model has
 * signal to learn. Cohorts have different baseline show rates; the
 * recent-attendance-rate feature should pick this up.
 *
 * Run: `pnpm --filter @gymflow/api seed`
 */
import { ClassCategory, PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

type Cohort = {
  name: string;
  size: number;
  showProbability: number;
  tenureDaysRange: [number, number];
};

const COHORTS: Cohort[] = [
  { name: "regular", size: 20, showProbability: 0.94, tenureDaysRange: [180, 800] },
  { name: "flaky", size: 12, showProbability: 0.58, tenureDaysRange: [30, 120] },
  { name: "new", size: 10, showProbability: 0.74, tenureDaysRange: [1, 20] },
];

const CLASS_TEMPLATES: Array<{
  title: string;
  category: ClassCategory;
  hour: number;
  duration: number;
  capacity: number;
  creditCost: number;
}> = [
  { title: "Morning HIIT", category: ClassCategory.HIIT, hour: 7, duration: 45, capacity: 12, creditCost: 1 },
  { title: "Power Cardio", category: ClassCategory.CARDIO, hour: 8, duration: 45, capacity: 14, creditCost: 1 },
  { title: "Lunch Yoga", category: ClassCategory.YOGA, hour: 12, duration: 50, capacity: 10, creditCost: 1 },
  { title: "Mobility Flow", category: ClassCategory.MOBILITY, hour: 17, duration: 40, capacity: 12, creditCost: 1 },
  { title: "Evening Spin", category: ClassCategory.CYCLING, hour: 18, duration: 45, capacity: 14, creditCost: 2 },
  { title: "Strength Foundations", category: ClassCategory.STRENGTH, hour: 19, duration: 60, capacity: 8, creditCost: 2 },
  { title: "Recovery & Stretch", category: ClassCategory.RECOVERY, hour: 20, duration: 40, capacity: 12, creditCost: 1 },
  { title: "Weekend Pilates", category: ClassCategory.PILATES, hour: 10, duration: 55, capacity: 10, creditCost: 1 },
];

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const rand = seededRand(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const jitter = (base: number, spread: number) => base + (rand() - 0.5) * spread;

async function main() {
  console.log("seed: cleaning existing data");
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ProgramRecommendation","BloodMarker","BloodTestReport","AttendanceLog","CheckIn","Booking","CreditPack","Member","User","Class","Trainer","AiDecisionLog" RESTART IDENTITY CASCADE',
  );

  console.log("seed: users + members");
  const adminHash = await bcrypt.hash("admin12345", 10);
  const memberHash = await bcrypt.hash("member12345", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@gym.test",
      passwordHash: adminHash,
      role: Role.ADMIN,
      member: {
        create: {
          email: "admin@gym.test",
          firstName: "Gym",
          lastName: "Owner",
          cohort: "regular",
        },
      },
    },
    include: { member: true },
  });
  console.log(`  admin: ${admin.email} / admin12345`);

  const members: { id: string; cohort: Cohort; tenureDays: number }[] = [];
  for (const cohort of COHORTS) {
    for (let i = 0; i < cohort.size; i++) {
      const tenureDays = Math.floor(
        cohort.tenureDaysRange[0] +
          rand() * (cohort.tenureDaysRange[1] - cohort.tenureDaysRange[0]),
      );
      const tenureStart = new Date(Date.now() - tenureDays * 86_400_000);
      const email = `${cohort.name}${i}@gym.test`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: memberHash,
          role: Role.MEMBER,
          member: {
            create: {
              email,
              firstName: `${cohort.name[0]!.toUpperCase()}${cohort.name.slice(1)}`,
              lastName: String(i).padStart(2, "0"),
              cohort: cohort.name,
              tenureStart,
            },
          },
        },
        include: { member: true },
      });
      members.push({ id: user.member!.id, cohort, tenureDays });
    }
  }
  console.log(`  members: ${members.length}`);

  console.log("seed: trainers");
  const trainers = await Promise.all(
    ["Eren", "Selin", "Mert"].map((name) =>
      prisma.trainer.create({ data: { name } }),
    ),
  );

  console.log("seed: classes (past 60 days + next 14 days)");
  const classes: { id: string; startsAt: Date; capacity: number; creditCost: number }[] = [];
  const now = Date.now();
  for (let dayOffset = -60; dayOffset <= 14; dayOffset++) {
    const dateBase = new Date(now + dayOffset * 86_400_000);
    dateBase.setUTCHours(0, 0, 0, 0);
    const isWeekend = dateBase.getUTCDay() === 0 || dateBase.getUTCDay() === 6;

    for (const tpl of CLASS_TEMPLATES) {
      if (tpl.title.includes("Weekend") && !isWeekend) continue;
      if (!tpl.title.includes("Weekend") && isWeekend && rand() > 0.5) continue;

      const startsAt = new Date(dateBase);
      startsAt.setUTCHours(tpl.hour, 0, 0, 0);
      const klass = await prisma.class.create({
        data: {
          title: tpl.title,
          category: tpl.category,
          startsAt,
          durationMinutes: tpl.duration,
          capacity: tpl.capacity,
          creditCost: tpl.creditCost,
          trainerId: pick(trainers).id,
          location: "Studio A",
        },
      });
      classes.push({
        id: klass.id,
        startsAt,
        capacity: tpl.capacity,
        creditCost: tpl.creditCost,
      });
    }
  }
  console.log(`  classes: ${classes.length}`);

  console.log("seed: grant credit packs");
  for (const m of members) {
    await prisma.creditPack.create({
      data: {
        memberId: m.id,
        amount: 30,
        remainingCredits: 30,
      },
    });
    await prisma.member.update({
      where: { id: m.id },
      data: { credits: 30 },
    });
  }

  console.log("seed: historical bookings + attendance");
  let bookings = 0;
  let shows = 0;
  let noShows = 0;

  for (const klass of classes) {
    const isPast = klass.startsAt.getTime() < now;
    if (!isPast) continue; // historical only for now

    // Pick members to book this class — 60–95% of capacity.
    const fill = 0.6 + rand() * 0.35;
    const want = Math.floor(klass.capacity * fill);
    const shuffled = [...members].sort(() => rand() - 0.5).slice(0, want);

    const startOfClass = klass.startsAt.getTime();
    const bookedAtBase = startOfClass - (1 + rand() * 48) * 3_600_000;

    for (const m of shuffled) {
      if (m.tenureDays < Math.floor((now - startOfClass) / 86_400_000)) continue;
      const bookedAt = new Date(bookedAtBase - rand() * 6 * 3_600_000);
      const showed = rand() < jitter(m.cohort.showProbability, 0.05);

      const b = await prisma.booking.create({
        data: {
          classId: klass.id,
          memberId: m.id,
          status: showed ? "CHECKED_IN" : "NO_SHOW",
          creditCost: klass.creditCost,
          bookedAt,
        },
      });

      if (showed) {
        await prisma.checkIn.create({
          data: {
            bookingId: b.id,
            checkedInAt: new Date(startOfClass - 5 * 60_000),
            method: "MANUAL",
          },
        });
      }
      await prisma.attendanceLog.create({
        data: {
          bookingId: b.id,
          classId: klass.id,
          memberId: m.id,
          showed,
          recordedAt: new Date(startOfClass + klass.creditCost * 60_000),
        },
      });

      bookings++;
      if (showed) shows++;
      else noShows++;
    }
  }

  const showRate = shows / (shows + noShows);
  console.log(
    `  bookings=${bookings} shows=${shows} no-shows=${noShows} rate=${showRate.toFixed(3)}`,
  );
  console.log("seed: done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
