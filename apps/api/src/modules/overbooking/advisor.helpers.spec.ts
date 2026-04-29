import {
  buildAdviceCacheKey,
  buildAdvisorPrompt,
  type AdvisorPromptInput,
} from "./advisor.helpers";

describe("buildAdviceCacheKey", () => {
  it("is order-insensitive on booking ids", () => {
    const a = buildAdviceCacheKey("c1", ["b1", "b2", "b3"], 0.9);
    const b = buildAdviceCacheKey("c1", ["b3", "b1", "b2"], 0.9);
    expect(a).toBe(b);
  });

  it("changes when overbook factor changes", () => {
    const a = buildAdviceCacheKey("c1", ["b1"], 0.9);
    const b = buildAdviceCacheKey("c1", ["b1"], 1.0);
    expect(a).not.toBe(b);
  });

  it("changes when booking set changes", () => {
    const a = buildAdviceCacheKey("c1", ["b1"], 0.9);
    const b = buildAdviceCacheKey("c1", ["b1", "b2"], 0.9);
    expect(a).not.toBe(b);
  });

  it("scopes the key by class id", () => {
    const a = buildAdviceCacheKey("c1", ["b1"], 0.9);
    const b = buildAdviceCacheKey("c2", ["b1"], 0.9);
    expect(a).not.toBe(b);
    expect(a.startsWith("overbook:advice:c1:")).toBe(true);
  });
});

describe("buildAdvisorPrompt", () => {
  const baseCtx = (): AdvisorPromptInput => ({
    class: {
      id: "c1",
      title: "Morning HIIT",
      startsAt: new Date("2025-06-15T09:00:00Z"),
      durationMinutes: 60,
      capacity: 20,
      trainer: { name: "Jane" },
    },
    liveBookings: [
      {
        id: "b1",
        bookedAt: new Date("2025-06-14T09:00:00Z"),
        member: {
          id: "m1",
          firstName: "Alice",
          lastName: "Doe",
          tenureStart: new Date(Date.now() - 60 * 86_400_000),
          cohort: "early-bird",
          attendance: [
            { showed: true },
            { showed: true },
            { showed: false },
            { showed: true },
          ],
        },
      },
    ],
  });

  it("produces valid JSON with the expected shape", () => {
    const out = buildAdvisorPrompt(baseCtx());
    const parsed = JSON.parse(out);
    expect(parsed.class).toMatchObject({
      id: "c1",
      title: "Morning HIIT",
      capacity: 20,
      durationMinutes: 60,
      trainer: "Jane",
    });
    expect(parsed.members).toHaveLength(1);
    expect(parsed.members[0]).toMatchObject({
      bookingId: "b1",
      memberId: "m1",
      name: "Alice Doe",
      cohort: "early-bird",
      recentSamples: 4,
      recentAttendanceRate: 0.75,
      leadTimeHours: 24,
    });
  });

  it("uses null for trainer when missing and null rate when no samples", () => {
    const ctx = baseCtx();
    ctx.class.trainer = null;
    ctx.liveBookings[0]!.member.attendance = [];
    const parsed = JSON.parse(buildAdvisorPrompt(ctx));
    expect(parsed.class.trainer).toBeNull();
    expect(parsed.members[0].recentAttendanceRate).toBeNull();
    expect(parsed.members[0].recentSamples).toBe(0);
  });

  it("includes the schema hint for the model", () => {
    const parsed = JSON.parse(buildAdvisorPrompt(baseCtx()));
    expect(parsed.schema).toMatchObject({
      overbookRecommendation: expect.stringContaining("ALLOW"),
      riskBand: expect.stringContaining("LOW"),
    });
  });
});
