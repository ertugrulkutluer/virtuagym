import { Injectable } from "@nestjs/common";
import {
  Booking,
  BookingStatus,
  CheckInMethod,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";

type Tx = Prisma.TransactionClient;

/**
 * All Prisma access for the booking domain lives here. Methods accept an
 * optional `Tx` so a service can stitch them together inside a single
 * `$transaction` callback without the repository owning the transaction.
 */
@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // ── Class helpers ───────────────────────────────────────────

  lockClass(tx: Tx, classId: string) {
    return tx.$queryRaw<
      Array<{
        id: string;
        capacity: number;
        creditCost: number;
        startsAt: Date;
        cancelled: boolean;
        durationMinutes: number;
      }>
    >`SELECT id, capacity, "creditCost", "startsAt", cancelled, "durationMinutes"
        FROM "Class" WHERE id = ${classId} FOR UPDATE`;
  }

  getClass(classId: string, tx?: Tx) {
    return (tx ?? this.prisma).class.findUnique({ where: { id: classId } });
  }

  // ── Booking queries ─────────────────────────────────────────

  findLiveForMember(tx: Tx, classId: string, memberId: string) {
    return tx.booking.findFirst({
      where: {
        classId,
        memberId,
        status: { in: ["ACTIVE", "PROMOTED", "WAITLISTED", "CHECKED_IN"] },
      },
    });
  }

  countActive(tx: Tx, classId: string) {
    return tx.booking.count({
      where: {
        classId,
        status: { in: ["ACTIVE", "PROMOTED", "CHECKED_IN"] },
      },
    });
  }

  nextWaitlistPosition(tx: Tx, classId: string): Promise<number> {
    return tx.booking
      .aggregate({
        where: { classId, status: "WAITLISTED" },
        _max: { waitlistPosition: true },
      })
      .then((r) => (r._max.waitlistPosition ?? 0) + 1);
  }

  createActive(tx: Tx, classId: string, memberId: string, creditCost: number) {
    return tx.booking.create({
      data: { classId, memberId, status: "ACTIVE", creditCost },
    });
  }

  createWaitlisted(
    tx: Tx,
    classId: string,
    memberId: string,
    creditCost: number,
    position: number,
  ) {
    return tx.booking.create({
      data: {
        classId,
        memberId,
        status: "WAITLISTED",
        creditCost,
        waitlistPosition: position,
      },
    });
  }

  lockById(tx: Tx, id: string) {
    return tx.$queryRaw<Booking[]>`SELECT * FROM "Booking" WHERE id = ${id} FOR UPDATE`;
  }

  markCancelled(tx: Tx, id: string) {
    return tx.booking.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  }

  setStatus(tx: Tx, id: string, status: BookingStatus) {
    return tx.booking.update({ where: { id }, data: { status } });
  }

  promoteWaitlistHead(tx: Tx, id: string) {
    return tx.booking.update({
      where: { id },
      data: {
        status: "PROMOTED",
        promotedFromWaitlistAt: new Date(),
        waitlistPosition: null,
      },
    });
  }

  shiftWaitlistPositionsAfter(tx: Tx, classId: string, afterPosition: number) {
    return tx.booking.updateMany({
      where: {
        classId,
        status: "WAITLISTED",
        waitlistPosition: { gt: afterPosition },
      },
      data: { waitlistPosition: { decrement: 1 } },
    });
  }

  lockWaitlistHead(tx: Tx, classId: string) {
    return tx.$queryRaw<Booking[]>`
      SELECT * FROM "Booking"
       WHERE "classId" = ${classId}
         AND status = 'WAITLISTED'
       ORDER BY "waitlistPosition" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`;
  }

  findPendingForClose(tx: Tx, classId: string) {
    return tx.booking.findMany({
      where: { classId, status: { in: ["ACTIVE", "PROMOTED"] } },
    });
  }

  // ── Member credit moves ─────────────────────────────────────

  /**
   * Atomic "decrement only if enough credits" — returns how many rows were
   * updated so the caller can detect insufficient balance without re-reading.
   */
  tryDecrementCredits(tx: Tx, memberId: string, cost: number) {
    return tx.member.updateMany({
      where: { id: memberId, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    });
  }

  refundCredits(tx: Tx, memberId: string, amount: number) {
    return tx.member.update({
      where: { id: memberId },
      data: { credits: { increment: amount } },
    });
  }

  // ── Check-in + attendance ───────────────────────────────────

  createCheckIn(tx: Tx, bookingId: string, method: CheckInMethod) {
    return tx.checkIn.create({
      data: { bookingId, method },
    });
  }

  upsertAttendance(
    tx: Tx,
    bookingId: string,
    classId: string,
    memberId: string,
    showed: boolean,
  ) {
    return tx.attendanceLog.upsert({
      where: { bookingId },
      create: { bookingId, classId, memberId, showed },
      update: { showed, recordedAt: new Date() },
    });
  }

  // ── Read APIs for controllers ───────────────────────────────

  listForMember(memberId: string) {
    return this.prisma.booking.findMany({
      where: { memberId },
      orderBy: [{ status: "asc" }, { bookedAt: "desc" }],
      include: {
        class: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            durationMinutes: true,
          },
        },
      },
    });
  }

  listForClass(classId: string) {
    return this.prisma.booking.findMany({
      where: { classId },
      orderBy: [{ status: "asc" }, { waitlistPosition: "asc" }],
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  findFullById(id: string) {
    return this.prisma.booking.findUnique({
      where: { id },
      include: {
        class: true,
        member: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        checkIn: true,
      },
    });
  }
}
