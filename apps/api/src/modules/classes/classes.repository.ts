import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateClassInput,
  ListClassesQuery,
  UpdateClassInput,
} from "@gymflow/shared";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class ClassesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateClassInput) {
    return this.prisma.class.create({
      data: {
        title: input.title,
        description: input.description,
        startsAt: new Date(input.startsAt),
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        creditCost: input.creditCost ?? 1,
        trainerId: input.trainerId,
        location: input.location,
        cancelled: input.cancelled ?? false,
      },
    });
  }

  findById(id: string) {
    return this.prisma.class.findUnique({
      where: { id },
      include: {
        trainer: { select: { id: true, name: true } },
        _count: { select: { bookings: { where: { status: "ACTIVE" } } } },
      },
    });
  }

  list(query: ListClassesQuery) {
    const where: Prisma.ClassWhereInput = {};
    if (!query.includeCancelled) where.cancelled = false;
    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) where.startsAt.gte = new Date(query.from);
      if (query.to) where.startsAt.lte = new Date(query.to);
    }
    const take = query.take ?? 50;
    const skip = query.skip ?? 0;

    return this.prisma.$transaction([
      this.prisma.class.findMany({
        where,
        orderBy: { startsAt: "asc" },
        take,
        skip,
        include: {
          trainer: { select: { id: true, name: true } },
          _count: { select: { bookings: { where: { status: "ACTIVE" } } } },
        },
      }),
      this.prisma.class.count({ where }),
    ]);
  }

  update(id: string, input: UpdateClassInput) {
    return this.prisma.class.update({
      where: { id },
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      },
    });
  }

  softCancel(id: string) {
    return this.prisma.class.update({
      where: { id },
      data: { cancelled: true },
    });
  }
}
