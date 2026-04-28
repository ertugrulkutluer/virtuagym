import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { INestApplication } from "@nestjs/common";
import { Role } from "@gymflow/shared";
import { PrismaService } from "../../src/core/prisma/prisma.service";
import { EnvService } from "../../src/config/env.service";

/**
 * Test-data builders. Inserts go through Prisma directly so tests can set up
 * arbitrary states (admins, low-credit members, classes in the past) without
 * routing through HTTP.
 */

let userCounter = 0;

export interface SeededUser {
  userId: string;
  memberId: string;
  email: string;
  role: Role;
  token: string;
}

export async function seedUser(
  app: INestApplication,
  opts: {
    role?: Role;
    credits?: number;
  } = {},
): Promise<SeededUser> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const env = app.get(EnvService);
  const role = opts.role ?? Role.MEMBER;
  const credits = opts.credits ?? 0;

  userCounter += 1;
  const email = `user-${Date.now()}-${userCounter}@test.local`;
  const passwordHash = await bcrypt.hash("password12345", 4);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role,
      member: {
        create: {
          email,
          firstName: "Test",
          lastName: `User${userCounter}`,
          credits,
        },
      },
    },
    include: { member: true },
  });

  const token = await jwt.signAsync(
    { sub: user.id, email: user.email, role: user.role },
    {
      secret: env.get("JWT_SECRET"),
      expiresIn: env.get("JWT_EXPIRES_IN"),
    },
  );

  return {
    userId: user.id,
    memberId: user.member!.id,
    email,
    role,
    token,
  };
}

export async function seedClass(
  app: INestApplication,
  opts: {
    capacity?: number;
    creditCost?: number;
    startsAt?: Date;
    durationMinutes?: number;
    cancelled?: boolean;
    title?: string;
  } = {},
) {
  const prisma = app.get(PrismaService);
  return prisma.class.create({
    data: {
      title: opts.title ?? "Test Class",
      capacity: opts.capacity ?? 5,
      creditCost: opts.creditCost ?? 1,
      durationMinutes: opts.durationMinutes ?? 60,
      startsAt: opts.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      cancelled: opts.cancelled ?? false,
    },
  });
}

let idemCounter = 0;
export function idempotencyKey(): string {
  idemCounter += 1;
  return `e2e-${Date.now()}-${idemCounter}-aaaaaaaa`;
}
