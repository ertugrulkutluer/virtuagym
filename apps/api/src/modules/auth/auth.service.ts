import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  LoginInput,
  RegisterInput,
  Role,
  type AuthTokens,
} from "@gymflow/shared";
import { User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { EnvService } from "../../config/env.service";
import { AuthRepository } from "./auth.repository";
import { JwtPayload } from "./strategies/jwt.strategy";

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: AuthRepository,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictException("email already registered");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.users.createWithMember({
      email: input.email,
      passwordHash,
      role: Role.MEMBER,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    });
    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new UnauthorizedException("invalid credentials");

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("invalid credentials");

    return this.issueTokens(user);
  }

  me(userId: string) {
    return this.users.getProfile(userId);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.get("JWT_SECRET"),
      expiresIn: this.env.get("JWT_EXPIRES_IN"),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.env.get("JWT_REFRESH_SECRET"),
        expiresIn: this.env.get("JWT_REFRESH_EXPIRES_IN"),
      },
    );
    return {
      user: { id: user.id, email: user.email, role: user.role as Role },
      accessToken,
      refreshToken,
    };
  }
}
