import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateMemberInput,
  GrantCreditsInput,
  ListMembersQuery,
  UpdateMemberInput,
} from "@gymflow/shared";
import { PrismaService } from "../../core/prisma/prisma.service";

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateMemberInput) {
    return this.prisma.member.create({ data: input });
  }

  findById(id: string) {
    return this.prisma.member.findUnique({
      where: { id },
      include: {
        creditPacks: { orderBy: { purchasedAt: "desc" } },
      },
    });
  }

  findByUserId(userId: string) {
    return this.prisma.member.findUnique({
      where: { userId },
      include: {
        creditPacks: { orderBy: { purchasedAt: "desc" } },
      },
    });
  }

  list(query: ListMembersQuery) {
    const where: Prisma.MemberWhereInput = {};
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.cohort) where.cohort = query.cohort;

    const take = query.take ?? 50;
    const skip = query.skip ?? 0;
    return this.prisma.$transaction([
      this.prisma.member.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      this.prisma.member.count({ where }),
    ]);
  }

  update(id: string, input: UpdateMemberInput) {
    return this.prisma.member.update({ where: { id }, data: input });
  }

  remove(id: string) {
    return this.prisma.member.delete({ where: { id } });
  }

  grantCreditsTx(id: string, input: GrantCreditsInput) {
    return this.prisma.$transaction(async (tx) => {
      const pack = await tx.creditPack.create({
        data: {
          memberId: id,
          amount: input.amount,
          remainingCredits: input.amount,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      const member = await tx.member.update({
        where: { id },
        data: { credits: { increment: input.amount } },
      });
      return { pack, balance: member.credits };
    });
  }

  isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
    );
  }
}
