import { Test } from "@nestjs/testing";
import { EnvService } from "../../config/env.service";
import { PrismaService } from "../../core/prisma/prisma.service";
import { RedisService } from "../../core/redis/redis.service";
import { AiDecisionRepository } from "./ai-decision.repository";
import { GrokClient } from "./grok-client.service";
import { NoShowAdvisor } from "./no-show-advisor.service";

describe("NoShowAdvisor.shouldAllowOverbook", () => {
  let advisor: NoShowAdvisor;
  const grok = { chat: jest.fn() };
  const decisions = { record: jest.fn(), history: jest.fn(), latestForClass: jest.fn() };
  const prisma = { class: { findUnique: jest.fn() } };
  const redis = {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(0),
    raw: jest.fn(),
    incr: jest.fn(),
  };
  const env = {
    get: jest.fn((k: string) => {
      if (k === "AI_ENABLED_DEFAULT") return true;
      if (k === "AI_OVERBOOK_FACTOR") return 0.9;
      if (k === "AI_ADVICE_CACHE_TTL_SECONDS") return 60;
      return "";
    }),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    redis.getJson.mockResolvedValue(null);
    redis.setJson.mockResolvedValue(undefined);
    env.get.mockImplementation((k: string) => {
      if (k === "AI_ENABLED_DEFAULT") return true;
      if (k === "AI_OVERBOOK_FACTOR") return 0.9;
      if (k === "AI_ADVICE_CACHE_TTL_SECONDS") return 60;
      return "";
    });
    const mod = await Test.createTestingModule({
      providers: [
        NoShowAdvisor,
        { provide: GrokClient, useValue: grok },
        { provide: AiDecisionRepository, useValue: decisions },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EnvService, useValue: env },
      ],
    }).compile();
    advisor = mod.get(NoShowAdvisor);
  });

  it("denies overbook when the advisor is disabled", async () => {
    advisor.setEnabled(false);
    const res = await advisor.shouldAllowOverbook("class-1");
    expect(res.allow).toBe(false);
    expect(res.reason).toBe("ai_disabled");
    expect(grok.chat).not.toHaveBeenCalled();
  });

  it("swallows advisor errors and denies overbook (fail-closed)", async () => {
    advisor.setEnabled(true);
    prisma.class.findUnique.mockResolvedValue({
      id: "class-1",
      capacity: 10,
      bookings: [{ id: "b1" }],
      trainer: null,
      startsAt: new Date(Date.now() + 3_600_000),
      title: "t",
      durationMinutes: 45,
    } as unknown as object);
    grok.chat.mockRejectedValue(new Error("network down"));
    const res = await advisor.shouldAllowOverbook("class-1");
    expect(res.allow).toBe(false);
    expect(res.reason).toBe("advisor_error");
  });

  it("rejects the factor setter when value is out of range", () => {
    expect(() => advisor.setOverbookFactor(0.1)).toThrow(/safe range/);
    expect(() => advisor.setOverbookFactor(1.5)).toThrow(/safe range/);
    advisor.setOverbookFactor(0.95);
    expect(advisor.getOverbookFactor()).toBe(0.95);
  });
});
