import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Booking, CheckInMethod } from "@prisma/client";
import { NoShowAdvisor } from "../ai/no-show-advisor.service";
import { BookingsRepository } from "./bookings.repository";

const CHECKIN_EARLY_WINDOW_MIN = 30;
const CHECKIN_LATE_WINDOW_MIN = 15;
const REFUND_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours before class

@Injectable()
export class BookingsService {
  constructor(
    private readonly repo: BookingsRepository,
    private readonly advisor: NoShowAdvisor,
  ) {}

  /**
   * Book a class for a member. Uses a Postgres row lock on the class to
   * serialise capacity decisions and an atomic credit decrement so the
   * balance can never go negative even under concurrent bookings.
   *
   * If the class is at hard capacity, consult the AI advisor — it may approve
   * an overbook when the expected attendance leaves enough headroom.
   */
  async book(memberId: string, classId: string): Promise<Booking> {
    // Ask the advisor *outside* the transaction — HTTP should never hold DB
    // locks. The decision is advisory; the authoritative capacity check still
    // runs inside the transaction below.
    const advice = await this.advisor
      .shouldAllowOverbook(classId)
      .catch(() => ({ allow: false, reason: "advisor_error" }));

    return this.repo.runInTransaction(async (tx) => {
      const locked = await this.repo.lockClass(tx, classId);
      if (locked.length === 0) throw new NotFoundException("class not found");
      const klass = locked[0]!;
      if (klass.cancelled) throw new BadRequestException("class is cancelled");
      if (klass.startsAt.getTime() <= Date.now()) {
        throw new BadRequestException("class has already started");
      }

      const existing = await this.repo.findLiveForMember(tx, classId, memberId);
      if (existing) throw new ConflictException("already booked for this class");

      const activeCount = await this.repo.countActive(tx, classId);

      if (activeCount >= klass.capacity && !advice.allow) {
        const position = await this.repo.nextWaitlistPosition(tx, classId);
        return this.repo.createWaitlisted(
          tx,
          classId,
          memberId,
          klass.creditCost,
          position,
        );
      }

      const charged = await this.repo.tryDecrementCredits(
        tx,
        memberId,
        klass.creditCost,
      );
      if (charged.count === 0) {
        throw new BadRequestException("insufficient credits");
      }

      return this.repo.createActive(tx, classId, memberId, klass.creditCost);
    });
  }

  async cancel(
    bookingId: string,
    memberId: string | null,
    asAdmin: boolean,
  ): Promise<Booking> {
    return this.repo.runInTransaction(async (tx) => {
      const locked = await this.repo.lockById(tx, bookingId);
      if (locked.length === 0) throw new NotFoundException("booking not found");
      const b = locked[0]!;
      if (!asAdmin && b.memberId !== memberId) {
        throw new ForbiddenException("not your booking");
      }
      if (b.status === "CANCELLED" || b.status === "NO_SHOW") {
        throw new BadRequestException("booking already closed");
      }
      if (b.status === "CHECKED_IN") {
        throw new BadRequestException("cannot cancel after check-in");
      }

      const klass = await this.repo.getClass(b.classId, tx);
      if (!klass) throw new NotFoundException("class not found");

      const refundable =
        klass.startsAt.getTime() - Date.now() > REFUND_THRESHOLD_MS;

      const cancelled = await this.repo.markCancelled(tx, b.id);

      if ((b.status === "ACTIVE" || b.status === "PROMOTED") && refundable) {
        await this.repo.refundCredits(tx, b.memberId, b.creditCost);
      }

      if (b.status === "WAITLISTED" && b.waitlistPosition !== null) {
        await this.repo.shiftWaitlistPositionsAfter(
          tx,
          b.classId,
          b.waitlistPosition,
        );
      }

      if (b.status === "ACTIVE" || b.status === "PROMOTED") {
        await this.tryPromoteWaitlistHead(tx, b.classId, klass.creditCost);
      }

      return cancelled;
    });
  }

  async checkIn(
    bookingId: string,
    method: CheckInMethod = "MANUAL",
  ): Promise<Booking> {
    return this.repo.runInTransaction(async (tx) => {
      const locked = await this.repo.lockById(tx, bookingId);
      if (locked.length === 0) throw new NotFoundException("booking not found");
      const b = locked[0]!;

      if (b.status === "CHECKED_IN") {
        throw new ConflictException("already checked in");
      }
      if (b.status !== "ACTIVE" && b.status !== "PROMOTED") {
        throw new BadRequestException(`cannot check in in status ${b.status}`);
      }

      const klass = await this.repo.getClass(b.classId, tx);
      if (!klass) throw new NotFoundException("class not found");

      const now = Date.now();
      const start = klass.startsAt.getTime();
      const end = start + klass.durationMinutes * 60_000;
      if (now < start - CHECKIN_EARLY_WINDOW_MIN * 60_000) {
        throw new BadRequestException("too early to check in");
      }
      if (now > end + CHECKIN_LATE_WINDOW_MIN * 60_000) {
        throw new BadRequestException("check-in window closed");
      }

      const updated = await this.repo.setStatus(tx, b.id, "CHECKED_IN");
      await this.repo.createCheckIn(tx, b.id, method);
      await this.repo.upsertAttendance(tx, b.id, b.classId, b.memberId, true);

      return updated;
    });
  }

  async closeClass(classId: string): Promise<{ marked: number }> {
    return this.repo.runInTransaction(async (tx) => {
      const klass = await this.repo.getClass(classId, tx);
      if (!klass) throw new NotFoundException("class not found");
      const end = klass.startsAt.getTime() + klass.durationMinutes * 60_000;
      if (Date.now() < end) {
        throw new BadRequestException("class has not ended yet");
      }

      const pending = await this.repo.findPendingForClose(tx, classId);
      for (const b of pending) {
        await this.repo.setStatus(tx, b.id, "NO_SHOW");
        await this.repo.upsertAttendance(tx, b.id, classId, b.memberId, false);
      }
      return { marked: pending.length };
    });
  }

  listForMember(memberId: string) {
    return this.repo.listForMember(memberId);
  }

  listForClass(classId: string) {
    return this.repo.listForClass(classId);
  }

  async get(bookingId: string) {
    const b = await this.repo.findFullById(bookingId);
    if (!b) throw new NotFoundException("booking not found");
    return b;
  }

  /**
   * Promote the head of the waitlist into an active slot. Skips members whose
   * credits have dropped below the class cost; they stay on the waitlist.
   * Uses `FOR UPDATE SKIP LOCKED` so concurrent cancellations don't promote
   * the same head twice.
   */
  private async tryPromoteWaitlistHead(
    tx: Parameters<Parameters<BookingsRepository["runInTransaction"]>[0]>[0],
    classId: string,
    creditCost: number,
  ): Promise<void> {
    const next = await this.repo.lockWaitlistHead(tx, classId);
    if (next.length === 0) return;
    const head = next[0]!;

    const charged = await this.repo.tryDecrementCredits(
      tx,
      head.memberId,
      creditCost,
    );
    if (charged.count === 0) return;

    await this.repo.promoteWaitlistHead(tx, head.id);
    if (head.waitlistPosition !== null) {
      await this.repo.shiftWaitlistPositionsAfter(
        tx,
        classId,
        head.waitlistPosition,
      );
    }
  }
}
