import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { NoShowAdvisor } from "../overbooking/no-show-advisor.service";
import { BookingsRepository } from "./bookings.repository";
import { BookingsService } from "./bookings.service";

const TX = { __tx: true } as unknown as Parameters<
  Parameters<BookingsRepository["runInTransaction"]>[0]
>[0];

describe("BookingsService", () => {
  let service: BookingsService;

  const repo = {
    runInTransaction: jest.fn(),
    lockClass: jest.fn(),
    getClass: jest.fn(),
    findLiveForMember: jest.fn(),
    countActive: jest.fn(),
    nextWaitlistPosition: jest.fn(),
    createActive: jest.fn(),
    createWaitlisted: jest.fn(),
    lockById: jest.fn(),
    markCancelled: jest.fn(),
    setStatus: jest.fn(),
    promoteWaitlistHead: jest.fn(),
    shiftWaitlistPositionsAfter: jest.fn(),
    lockWaitlistHead: jest.fn(),
    findPendingForClose: jest.fn(),
    tryDecrementCredits: jest.fn(),
    refundCredits: jest.fn(),
    createCheckIn: jest.fn(),
    upsertAttendance: jest.fn(),
  };

  const advisor = { shouldAllowOverbook: jest.fn() };

  const futureClass = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: "class-1",
    capacity: 10,
    creditCost: 2,
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    cancelled: false,
    durationMinutes: 60,
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    repo.runInTransaction.mockImplementation(
      (fn: (tx: unknown) => unknown) => fn(TX),
    );
    advisor.shouldAllowOverbook.mockResolvedValue({
      allow: false,
      reason: "ok",
    });

    const mod = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: BookingsRepository, useValue: repo },
        { provide: NoShowAdvisor, useValue: advisor },
      ],
    }).compile();
    service = mod.get(BookingsService);
  });

  // ── book ─────────────────────────────────────────────────────

  describe("book", () => {
    it("creates an ACTIVE booking and charges credits when there is room", async () => {
      repo.lockClass.mockResolvedValue([futureClass()]);
      repo.findLiveForMember.mockResolvedValue(null);
      repo.countActive.mockResolvedValue(3);
      repo.tryDecrementCredits.mockResolvedValue({ count: 1 });
      repo.createActive.mockResolvedValue({ id: "b1", status: "ACTIVE" });

      const res = await service.book("m1", "class-1");

      expect(repo.tryDecrementCredits).toHaveBeenCalledWith(TX, "m1", 2);
      expect(repo.createActive).toHaveBeenCalledWith(TX, "class-1", "m1", 2);
      expect(repo.createWaitlisted).not.toHaveBeenCalled();
      expect(res).toEqual({ id: "b1", status: "ACTIVE" });
    });

    it("throws NotFound when the class does not exist", async () => {
      repo.lockClass.mockResolvedValue([]);
      await expect(service.book("m1", "class-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws BadRequest when the class is cancelled", async () => {
      repo.lockClass.mockResolvedValue([futureClass({ cancelled: true })]);
      await expect(service.book("m1", "class-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("throws BadRequest when the class has already started", async () => {
      repo.lockClass.mockResolvedValue([
        futureClass({ startsAt: new Date(Date.now() - 1000) }),
      ]);
      await expect(service.book("m1", "class-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects a duplicate booking with Conflict", async () => {
      repo.lockClass.mockResolvedValue([futureClass()]);
      repo.findLiveForMember.mockResolvedValue({ id: "b-existing" });
      await expect(service.book("m1", "class-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("waitlists when at capacity and the advisor denies overbook", async () => {
      repo.lockClass.mockResolvedValue([futureClass({ capacity: 5 })]);
      repo.findLiveForMember.mockResolvedValue(null);
      repo.countActive.mockResolvedValue(5);
      repo.nextWaitlistPosition.mockResolvedValue(3);
      repo.createWaitlisted.mockResolvedValue({
        id: "b1",
        status: "WAITLISTED",
        waitlistPosition: 3,
      });

      const res = await service.book("m1", "class-1");

      expect(repo.createWaitlisted).toHaveBeenCalledWith(
        TX,
        "class-1",
        "m1",
        2,
        3,
      );
      expect(repo.tryDecrementCredits).not.toHaveBeenCalled();
      expect(res.status).toBe("WAITLISTED");
    });

    it("allows an overbooked ACTIVE booking when the advisor approves", async () => {
      advisor.shouldAllowOverbook.mockResolvedValue({
        allow: true,
        reason: "advisor_approved",
      });
      repo.lockClass.mockResolvedValue([futureClass({ capacity: 5 })]);
      repo.findLiveForMember.mockResolvedValue(null);
      repo.countActive.mockResolvedValue(5);
      repo.tryDecrementCredits.mockResolvedValue({ count: 1 });
      repo.createActive.mockResolvedValue({ id: "b1", status: "ACTIVE" });

      const res = await service.book("m1", "class-1");

      expect(repo.createActive).toHaveBeenCalled();
      expect(repo.createWaitlisted).not.toHaveBeenCalled();
      expect(res.status).toBe("ACTIVE");
    });

    it("falls back to deny when the advisor throws", async () => {
      advisor.shouldAllowOverbook.mockRejectedValue(new Error("network"));
      repo.lockClass.mockResolvedValue([futureClass({ capacity: 5 })]);
      repo.findLiveForMember.mockResolvedValue(null);
      repo.countActive.mockResolvedValue(5);
      repo.nextWaitlistPosition.mockResolvedValue(1);
      repo.createWaitlisted.mockResolvedValue({
        id: "b1",
        status: "WAITLISTED",
      });

      await service.book("m1", "class-1");

      expect(repo.createWaitlisted).toHaveBeenCalled();
    });

    it("throws BadRequest when credits are insufficient", async () => {
      repo.lockClass.mockResolvedValue([futureClass()]);
      repo.findLiveForMember.mockResolvedValue(null);
      repo.countActive.mockResolvedValue(0);
      repo.tryDecrementCredits.mockResolvedValue({ count: 0 });

      await expect(service.book("m1", "class-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.createActive).not.toHaveBeenCalled();
    });

    it("never holds the advisor call inside the DB transaction", async () => {
      const callOrder: string[] = [];
      advisor.shouldAllowOverbook.mockImplementation(async () => {
        callOrder.push("advisor");
        return { allow: false, reason: "ok" };
      });
      repo.runInTransaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) => {
          callOrder.push("tx-start");
          const r = await fn(TX);
          callOrder.push("tx-end");
          return r;
        },
      );
      repo.lockClass.mockResolvedValue([futureClass()]);
      repo.findLiveForMember.mockResolvedValue(null);
      repo.countActive.mockResolvedValue(0);
      repo.tryDecrementCredits.mockResolvedValue({ count: 1 });
      repo.createActive.mockResolvedValue({ id: "b1" });

      await service.book("m1", "class-1");

      expect(callOrder[0]).toBe("advisor");
      expect(callOrder.indexOf("tx-start")).toBeGreaterThan(
        callOrder.indexOf("advisor"),
      );
    });
  });

  // ── cancel ────────────────────────────────────────────────────

  describe("cancel", () => {
    const activeBooking = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: "b1",
      memberId: "m1",
      classId: "class-1",
      status: "ACTIVE",
      creditCost: 2,
      waitlistPosition: null,
      ...overrides,
    });

    it("throws NotFound when the booking is missing", async () => {
      repo.lockById.mockResolvedValue([]);
      await expect(service.cancel("b1", "m1", false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("forbids cancelling someone else's booking when not admin", async () => {
      repo.lockById.mockResolvedValue([activeBooking({ memberId: "other" })]);
      await expect(service.cancel("b1", "m1", false)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("allows admins to cancel any booking", async () => {
      repo.lockById.mockResolvedValue([activeBooking({ memberId: "other" })]);
      repo.getClass.mockResolvedValue({
        id: "class-1",
        creditCost: 2,
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.markCancelled.mockResolvedValue({ id: "b1", status: "CANCELLED" });
      repo.lockWaitlistHead.mockResolvedValue([]);

      await expect(service.cancel("b1", null, true)).resolves.toMatchObject({
        status: "CANCELLED",
      });
    });

    it("rejects cancelling an already-closed booking", async () => {
      repo.lockById.mockResolvedValue([activeBooking({ status: "CANCELLED" })]);
      await expect(service.cancel("b1", "m1", false)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects cancelling after check-in", async () => {
      repo.lockById.mockResolvedValue([
        activeBooking({ status: "CHECKED_IN" }),
      ]);
      await expect(service.cancel("b1", "m1", false)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refunds credits when cancelling more than 2h before the class", async () => {
      repo.lockById.mockResolvedValue([activeBooking()]);
      repo.getClass.mockResolvedValue({
        id: "class-1",
        creditCost: 2,
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.markCancelled.mockResolvedValue({ id: "b1" });
      repo.lockWaitlistHead.mockResolvedValue([]);

      await service.cancel("b1", "m1", false);

      expect(repo.refundCredits).toHaveBeenCalledWith(TX, "m1", 2);
    });

    it("does not refund when cancelling within the 2h cutoff", async () => {
      repo.lockById.mockResolvedValue([activeBooking()]);
      repo.getClass.mockResolvedValue({
        id: "class-1",
        creditCost: 2,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.markCancelled.mockResolvedValue({ id: "b1" });
      repo.lockWaitlistHead.mockResolvedValue([]);

      await service.cancel("b1", "m1", false);

      expect(repo.refundCredits).not.toHaveBeenCalled();
    });

    it("shifts waitlist positions when a waitlisted booking is cancelled", async () => {
      repo.lockById.mockResolvedValue([
        activeBooking({ status: "WAITLISTED", waitlistPosition: 4 }),
      ]);
      repo.getClass.mockResolvedValue({
        id: "class-1",
        creditCost: 2,
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.markCancelled.mockResolvedValue({ id: "b1" });

      await service.cancel("b1", "m1", false);

      expect(repo.shiftWaitlistPositionsAfter).toHaveBeenCalledWith(
        TX,
        "class-1",
        4,
      );
      expect(repo.refundCredits).not.toHaveBeenCalled();
      expect(repo.lockWaitlistHead).not.toHaveBeenCalled();
    });

    it("promotes the waitlist head when an ACTIVE seat opens up", async () => {
      repo.lockById.mockResolvedValue([activeBooking()]);
      repo.getClass.mockResolvedValue({
        id: "class-1",
        creditCost: 2,
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.markCancelled.mockResolvedValue({ id: "b1" });
      repo.lockWaitlistHead.mockResolvedValue([
        { id: "head", memberId: "m2", waitlistPosition: 1 },
      ]);
      repo.tryDecrementCredits.mockResolvedValue({ count: 1 });

      await service.cancel("b1", "m1", false);

      expect(repo.tryDecrementCredits).toHaveBeenCalledWith(TX, "m2", 2);
      expect(repo.promoteWaitlistHead).toHaveBeenCalledWith(TX, "head");
      expect(repo.shiftWaitlistPositionsAfter).toHaveBeenCalledWith(
        TX,
        "class-1",
        1,
      );
    });

    it("skips promotion when the waitlist head cannot afford the class", async () => {
      repo.lockById.mockResolvedValue([activeBooking()]);
      repo.getClass.mockResolvedValue({
        id: "class-1",
        creditCost: 2,
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.markCancelled.mockResolvedValue({ id: "b1" });
      repo.lockWaitlistHead.mockResolvedValue([
        { id: "head", memberId: "m2", waitlistPosition: 1 },
      ]);
      repo.tryDecrementCredits.mockResolvedValue({ count: 0 });

      await service.cancel("b1", "m1", false);

      expect(repo.promoteWaitlistHead).not.toHaveBeenCalled();
    });
  });

  // ── checkIn ───────────────────────────────────────────────────

  describe("checkIn", () => {
    const klass = (offsetMs = 0) => ({
      id: "class-1",
      startsAt: new Date(Date.now() + offsetMs),
      durationMinutes: 60,
      capacity: 10,
      creditCost: 2,
      cancelled: false,
    });

    it("throws NotFound when booking does not exist", async () => {
      repo.lockById.mockResolvedValue([]);
      await expect(service.checkIn("b1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws Conflict when already checked in", async () => {
      repo.lockById.mockResolvedValue([
        { id: "b1", status: "CHECKED_IN", classId: "class-1", memberId: "m1" },
      ]);
      await expect(service.checkIn("b1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("rejects check-in for non-active statuses", async () => {
      repo.lockById.mockResolvedValue([
        { id: "b1", status: "WAITLISTED", classId: "class-1", memberId: "m1" },
      ]);
      await expect(service.checkIn("b1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects check-in too early (more than 30 min before start)", async () => {
      repo.lockById.mockResolvedValue([
        { id: "b1", status: "ACTIVE", classId: "class-1", memberId: "m1" },
      ]);
      repo.getClass.mockResolvedValue(klass(60 * 60 * 1000));
      await expect(service.checkIn("b1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects check-in too late (more than 15 min after end)", async () => {
      repo.lockById.mockResolvedValue([
        { id: "b1", status: "ACTIVE", classId: "class-1", memberId: "m1" },
      ]);
      // start was 2h ago; class is 60 min long; window closed 45 min ago
      repo.getClass.mockResolvedValue(klass(-2 * 60 * 60 * 1000));
      await expect(service.checkIn("b1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("checks in within the allowed window and records attendance", async () => {
      repo.lockById.mockResolvedValue([
        { id: "b1", status: "ACTIVE", classId: "class-1", memberId: "m1" },
      ]);
      // class starts in 5 min — well within the 30-min early window
      repo.getClass.mockResolvedValue(klass(5 * 60 * 1000));
      repo.setStatus.mockResolvedValue({ id: "b1", status: "CHECKED_IN" });

      const res = await service.checkIn("b1");

      expect(repo.setStatus).toHaveBeenCalledWith(TX, "b1", "CHECKED_IN");
      expect(repo.createCheckIn).toHaveBeenCalledWith(TX, "b1", "MANUAL");
      expect(repo.upsertAttendance).toHaveBeenCalledWith(
        TX,
        "b1",
        "class-1",
        "m1",
        true,
      );
      expect(res.status).toBe("CHECKED_IN");
    });
  });

  // ── closeClass ────────────────────────────────────────────────

  describe("closeClass", () => {
    it("throws NotFound when the class is missing", async () => {
      repo.getClass.mockResolvedValue(null);
      await expect(service.closeClass("class-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rejects closing a class that hasn't ended yet", async () => {
      repo.getClass.mockResolvedValue({
        id: "class-1",
        startsAt: new Date(Date.now() + 60 * 1000),
        durationMinutes: 60,
      });
      await expect(service.closeClass("class-1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("marks every pending booking as NO_SHOW with a missed-attendance row", async () => {
      repo.getClass.mockResolvedValue({
        id: "class-1",
        startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        durationMinutes: 60,
      });
      repo.findPendingForClose.mockResolvedValue([
        { id: "b1", memberId: "m1" },
        { id: "b2", memberId: "m2" },
      ]);

      const res = await service.closeClass("class-1");

      expect(res).toEqual({ marked: 2 });
      expect(repo.setStatus).toHaveBeenCalledTimes(2);
      expect(repo.setStatus).toHaveBeenCalledWith(TX, "b1", "NO_SHOW");
      expect(repo.setStatus).toHaveBeenCalledWith(TX, "b2", "NO_SHOW");
      expect(repo.upsertAttendance).toHaveBeenCalledWith(
        TX,
        "b1",
        "class-1",
        "m1",
        false,
      );
    });
  });

  // ── get ───────────────────────────────────────────────────────

  it("get throws NotFound when the booking does not exist", async () => {
    const repoWithFind = repo as unknown as {
      findFullById: jest.Mock;
    };
    repoWithFind.findFullById = jest.fn().mockResolvedValue(null);
    await expect(service.get("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
