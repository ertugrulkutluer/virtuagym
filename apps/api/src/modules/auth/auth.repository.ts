import { Injectable } from "@nestjs/common";
import { Prisma, Role, User } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface NewUserWithMember {
  email: string;
  passwordHash: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  createWithMember(input: NewUserWithMember): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        member: {
          create: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
          },
        },
      },
    });
  }

  getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            credits: true,
            tenureStart: true,
          },
        },
      },
    });
  }

  /**
   * Safe wrapper for uniqueness errors so services don't depend on Prisma's
   * error codes directly.
   */
  isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
    );
  }
}
