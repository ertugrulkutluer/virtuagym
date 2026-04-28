import { Role } from "@gymflow/shared";
import { buildTestApp, TestContext } from "./utils/app";
import { resetDb } from "./utils/db";
import { idempotencyKey, seedClass, seedUser } from "./utils/factories";

describe("Bookings (e2e)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.advisor.allow = false;
  });

  it("books a class on the happy path and decrements credits", async () => {
    const member = await seedUser(ctx.app, { credits: 5 });
    const klass = await seedClass(ctx.app, { capacity: 5, creditCost: 2 });

    const res = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.creditCost).toBe(2);

    const after = await ctx.prisma.member.findUnique({
      where: { id: member.memberId },
    });
    expect(after?.credits).toBe(3);
  });

  it("rejects booking when the member has insufficient credits", async () => {
    const member = await seedUser(ctx.app, { credits: 0 });
    const klass = await seedClass(ctx.app, { capacity: 5, creditCost: 2 });

    const res = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id });

    expect(res.status).toBe(400);
    const credits = (
      await ctx.prisma.member.findUnique({ where: { id: member.memberId } })
    )?.credits;
    expect(credits).toBe(0);
  });

  it("waitlists once capacity is full and the advisor denies overbook", async () => {
    const klass = await seedClass(ctx.app, { capacity: 1, creditCost: 1 });
    const first = await seedUser(ctx.app, { credits: 5 });
    const second = await seedUser(ctx.app, { credits: 5 });

    await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${first.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    const res = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${second.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("WAITLISTED");
    expect(res.body.waitlistPosition).toBe(1);

    const secondMember = await ctx.prisma.member.findUnique({
      where: { id: second.memberId },
    });
    expect(secondMember?.credits).toBe(5); // not charged on waitlist
  });

  it("promotes the waitlist head and refunds when an active seat is cancelled in time", async () => {
    const klass = await seedClass(ctx.app, {
      capacity: 1,
      creditCost: 1,
      startsAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });
    const first = await seedUser(ctx.app, { credits: 5 });
    const second = await seedUser(ctx.app, { credits: 5 });

    const firstBooking = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${first.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${second.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    const cancel = await ctx
      .http()
      .delete(`/api/bookings/${firstBooking.body.id}`)
      .set("Authorization", `Bearer ${first.token}`)
      .set("Idempotency-Key", idempotencyKey());

    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELLED");

    const firstMember = await ctx.prisma.member.findUnique({
      where: { id: first.memberId },
    });
    expect(firstMember?.credits).toBe(5); // refunded — cancelled >2h before start

    const secondMember = await ctx.prisma.member.findUnique({
      where: { id: second.memberId },
    });
    expect(secondMember?.credits).toBe(4); // charged on promotion

    const promoted = await ctx.prisma.booking.findFirst({
      where: { memberId: second.memberId, classId: klass.id },
    });
    expect(promoted?.status).toBe("PROMOTED");
    expect(promoted?.waitlistPosition).toBeNull();
  });

  it("does not refund credits when a cancellation happens within the 2h cutoff", async () => {
    const klass = await seedClass(ctx.app, {
      capacity: 1,
      creditCost: 2,
      startsAt: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
    });
    const member = await seedUser(ctx.app, { credits: 5 });

    const booking = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    await ctx
      .http()
      .delete(`/api/bookings/${booking.body.id}`)
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .expect(200);

    const after = await ctx.prisma.member.findUnique({
      where: { id: member.memberId },
    });
    expect(after?.credits).toBe(3); // no refund
  });

  it("allows the advisor to permit an overbook past hard capacity", async () => {
    ctx.advisor.allow = true;
    ctx.advisor.reason = "advisor_approved";

    const klass = await seedClass(ctx.app, { capacity: 1, creditCost: 1 });
    const first = await seedUser(ctx.app, { credits: 5 });
    const second = await seedUser(ctx.app, { credits: 5 });

    await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${first.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    const res = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${second.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
  });

  it("forbids cancelling someone else's booking", async () => {
    const klass = await seedClass(ctx.app, { capacity: 5, creditCost: 1 });
    const owner = await seedUser(ctx.app, { credits: 5 });
    const stranger = await seedUser(ctx.app, { credits: 5 });

    const booking = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    const res = await ctx
      .http()
      .delete(`/api/bookings/${booking.body.id}`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .set("Idempotency-Key", idempotencyKey());

    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated booking attempts", async () => {
    const klass = await seedClass(ctx.app, { capacity: 5, creditCost: 1 });
    const res = await ctx
      .http()
      .post("/api/bookings")
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id });
    expect(res.status).toBe(401);
  });

  it("admin can check in a booking and attendance is recorded", async () => {
    const admin = await seedUser(ctx.app, { role: Role.ADMIN, credits: 0 });
    const member = await seedUser(ctx.app, { credits: 5 });
    const klass = await seedClass(ctx.app, {
      capacity: 5,
      creditCost: 1,
      startsAt: new Date(Date.now() + 5 * 60 * 1000), // within 30-min early window
    });

    const booking = await ctx
      .http()
      .post("/api/bookings")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ classId: klass.id })
      .expect(201);

    const res = await ctx
      .http()
      .post(`/api/bookings/${booking.body.id}/check-in`)
      .set("Authorization", `Bearer ${admin.token}`)
      .set("Idempotency-Key", idempotencyKey())
      .send({ method: "MANUAL" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CHECKED_IN");

    const attendance = await ctx.prisma.attendanceLog.findUnique({
      where: { bookingId: booking.body.id },
    });
    expect(attendance?.showed).toBe(true);
  });
});
