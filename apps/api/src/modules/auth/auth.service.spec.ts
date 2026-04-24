import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import { EnvService } from "../../config/env.service";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let auth: AuthService;
  const repo = {
    findByEmail: jest.fn(),
    createWithMember: jest.fn(),
    getProfile: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue("jwt.token") };
  const env = { get: jest.fn().mockReturnValue("secret-12345678") };

  beforeEach(async () => {
    jest.resetAllMocks();
    jwt.signAsync.mockResolvedValue("jwt.token");
    env.get.mockReturnValue("secret-12345678");
    const mod = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: repo },
        { provide: JwtService, useValue: jwt },
        { provide: EnvService, useValue: env },
      ],
    }).compile();
    auth = mod.get(AuthService);
  });

  it("hashes the password and delegates creation to the repository", async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.createWithMember.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      passwordHash: "hash",
      role: "MEMBER",
    });

    const res = await auth.register({
      email: "a@b.c",
      password: "testtest123",
      firstName: "A",
      lastName: "B",
    });

    expect(repo.createWithMember).toHaveBeenCalledTimes(1);
    const args = repo.createWithMember.mock.calls[0][0];
    expect(args.email).toBe("a@b.c");
    expect(args.passwordHash).not.toBe("testtest123");
    expect(res.accessToken).toBe("jwt.token");
    expect(res.user.role).toBe("MEMBER");
  });

  it("rejects duplicate email", async () => {
    repo.findByEmail.mockResolvedValue({ id: "u1", email: "a@b.c" });
    await expect(
      auth.register({
        email: "a@b.c",
        password: "testtest123",
        firstName: "A",
        lastName: "B",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.createWithMember).not.toHaveBeenCalled();
  });

  it("rejects wrong password on login", async () => {
    const passwordHash = await bcrypt.hash("correct12345", 4);
    repo.findByEmail.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      passwordHash,
      role: "MEMBER",
    });
    await expect(
      auth.login({ email: "a@b.c", password: "wrongpassword" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("issues both access and refresh tokens on successful login", async () => {
    const passwordHash = await bcrypt.hash("correct12345", 4);
    repo.findByEmail.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      passwordHash,
      role: "MEMBER",
    });
    const res = await auth.login({ email: "a@b.c", password: "correct12345" });
    expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    expect(res.accessToken).toBe("jwt.token");
    expect(res.refreshToken).toBe("jwt.token");
  });
});
