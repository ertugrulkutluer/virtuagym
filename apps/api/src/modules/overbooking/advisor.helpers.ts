import { createHash } from "node:crypto";

export interface AdvisorPromptInput {
  class: {
    id: string;
    title: string;
    startsAt: Date;
    durationMinutes: number;
    capacity: number;
    trainer: { name: string } | null;
  };
  liveBookings: Array<{
    id: string;
    bookedAt: Date;
    member: {
      id: string;
      firstName: string;
      lastName: string;
      tenureStart: Date;
      cohort: string | null;
      attendance: Array<{ showed: boolean }>;
    };
  }>;
}

export function buildAdviceCacheKey(
  classId: string,
  bookingIds: string[],
  overbookFactor: number,
): string {
  const digest = createHash("sha1")
    .update(`${bookingIds.slice().sort().join(",")}|f${overbookFactor}`)
    .digest("hex")
    .slice(0, 16);
  return `overbook:advice:${classId}:${digest}`;
}

export function buildAdvisorPrompt(ctx: AdvisorPromptInput): string {
  const { class: klass, liveBookings } = ctx;

  const members = liveBookings.map((b) => {
    const recent = b.member.attendance;
    const rate =
      recent.length === 0
        ? null
        : recent.filter((a) => a.showed).length / recent.length;
    return {
      bookingId: b.id,
      memberId: b.member.id,
      name: `${b.member.firstName} ${b.member.lastName}`,
      cohort: b.member.cohort,
      tenureDays: Math.floor(
        (Date.now() - b.member.tenureStart.getTime()) / 86_400_000,
      ),
      recentAttendanceRate: rate,
      recentSamples: recent.length,
      leadTimeHours: Number(
        ((klass.startsAt.getTime() - b.bookedAt.getTime()) / 3_600_000).toFixed(1),
      ),
    };
  });

  return JSON.stringify(
    {
      class: {
        id: klass.id,
        title: klass.title,
        startsAt: klass.startsAt.toISOString(),
        hourOfDayUTC: klass.startsAt.getUTCHours(),
        dayOfWeekUTC: klass.startsAt.getUTCDay(),
        durationMinutes: klass.durationMinutes,
        capacity: klass.capacity,
        trainer: klass.trainer?.name ?? null,
      },
      members,
      schema: {
        expectedAttendance: "number — sum of showProbability across members",
        expectedNoShows: "number — members.length - expectedAttendance",
        overbookRecommendation: "'ALLOW' or 'DENY'",
        riskBand: "'LOW' | 'MEDIUM' | 'HIGH'",
        rationale: "short 1–2 sentence reason",
        perBooking: [
          {
            bookingId: "string",
            showProbability: "0..1",
            note: "optional short note",
          },
        ],
      },
    },
    null,
    2,
  );
}
