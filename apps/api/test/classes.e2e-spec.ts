import { Role } from "@gymflow/shared";
import { buildTestApp, TestContext } from "./utils/app";
import { resetDb } from "./utils/db";
import { seedClass, seedUser } from "./utils/factories";

describe("Classes (e2e)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it("lists classes publicly without auth", async () => {
    await seedClass(ctx.app, { title: "Public Class" });

    const res = await ctx.http().get("/api/classes");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("Public Class");
    expect(res.body.total).toBe(1);
    expect(res.body.take).toBe(50);
    expect(res.body.skip).toBe(0);
  });

  it("returns 404 when fetching an unknown class", async () => {
    const res = await ctx.http().get("/api/classes/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("rejects creating a class without an admin token", async () => {
    const member = await seedUser(ctx.app, { role: Role.MEMBER });
    const res = await ctx
      .http()
      .post("/api/classes")
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        title: "Forbidden",
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        capacity: 5,
      });
    expect(res.status).toBe(403);
  });

  it("admin can create, update and soft-cancel a class", async () => {
    const admin = await seedUser(ctx.app, { role: Role.ADMIN });

    const created = await ctx
      .http()
      .post("/api/classes")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "HIIT 30",
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 30,
        capacity: 8,
        creditCost: 2,
      });
    expect(created.status).toBe(201);
    expect(created.body.creditCost).toBe(2);

    const id = created.body.id;

    const updated = await ctx
      .http()
      .patch(`/api/classes/${id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "HIIT 30 — updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("HIIT 30 — updated");

    const removed = await ctx
      .http()
      .delete(`/api/classes/${id}`)
      .set("Authorization", `Bearer ${admin.token}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ id, cancelled: true });

    const fetched = await ctx
      .http()
      .get("/api/classes")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(fetched.body.items).toHaveLength(0); // soft-cancelled, hidden by default
  });

  it("filters out cancelled classes by default and includes them on opt-in", async () => {
    const admin = await seedUser(ctx.app, { role: Role.ADMIN });
    await seedClass(ctx.app, { title: "Live" });
    await seedClass(ctx.app, { title: "Dead", cancelled: true });

    const live = await ctx.http().get("/api/classes");
    expect(live.body.items.map((c: { title: string }) => c.title)).toEqual([
      "Live",
    ]);

    const all = await ctx
      .http()
      .get("/api/classes?includeCancelled=true")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(all.body.items).toHaveLength(2);
  });
});
