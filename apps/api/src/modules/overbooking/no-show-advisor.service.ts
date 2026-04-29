import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  NoShowAdvisorResponse,
  NoShowAdvisorResponseSchema,
} from "@gymflow/shared";
import { EnvService } from "../../config/env.service";
import { PrismaService } from "../../core/prisma/prisma.service";
import { RedisService } from "../../core/redis/redis.service";
import { GrokClient } from "../../core/grok/grok.service";
import { OverbookDecisionRepository } from "./overbook-decision.repository";
import { buildAdviceCacheKey, buildAdvisorPrompt } from "./advisor.helpers";

interface OverbookDecision {
  allow: boolean;
  reason: string;
  advice?: NoShowAdvisorResponse;
}

/**
 * Domain layer over `GrokClient`. Builds a minimal context prompt from the
 * current class + live bookings, asks Grok for a strictly-shaped JSON answer,
 * validates it with Zod, persists the decision for audit, and returns an
 * overbook recommendation.
 *
 * Everything above `GrokClient` lives here so controllers / booking service
 * don't have to know the prompt format.
 */
@Injectable()
export class NoShowAdvisor {
  private readonly logger = new Logger(NoShowAdvisor.name);
  private enabled: boolean;
  private overbookFactor: number;

  private readonly cacheTtl: number;

  constructor(
    private readonly grok: GrokClient,
    private readonly decisions: OverbookDecisionRepository,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly env: EnvService,
  ) {
    this.enabled = env.get("AI_ENABLED_DEFAULT");
    this.overbookFactor = env.get("AI_OVERBOOK_FACTOR");
    this.cacheTtl = env.get("AI_ADVICE_CACHE_TTL_SECONDS");
  }

  isEnabled(): boolean {
    return this.enabled;
  }
  setEnabled(v: boolean) {
    this.enabled = v;
    this.logger.log(`advisor.enabled = ${v}`);
  }
  getOverbookFactor(): number {
    return this.overbookFactor;
  }
  setOverbookFactor(v: number) {
    if (v < 0.5 || v > 1.2) throw new Error("overbook factor out of safe range");
    this.overbookFactor = v;
  }

  async shouldAllowOverbook(classId: string): Promise<OverbookDecision> {
    if (!this.enabled) return { allow: false, reason: "ai_disabled" };
    try {
      const advice = await this.adviseForClass(classId);
      const headroom =
        advice.expectedAttendance === 0
          ? 0
          : (await this.capacityOf(classId)) * this.overbookFactor -
            advice.expectedAttendance;
      const allow =
        advice.overbookRecommendation === "ALLOW" && headroom >= 1;
      return {
        allow,
        reason: allow
          ? `advisor ALLOW, headroom=${headroom.toFixed(2)}`
          : `advisor ${advice.overbookRecommendation}, headroom=${headroom.toFixed(2)}`,
        advice,
      };
    } catch (err) {
      this.logger.warn(
        `advisor failed, denying overbook: ${(err as Error).message}`,
      );
      return { allow: false, reason: "advisor_error" };
    }
  }

  async adviseForClass(classId: string): Promise<NoShowAdvisorResponse> {
    const context = await this.gatherContext(classId);
    if (context.liveBookings.length === 0) {
      return {
        expectedAttendance: 0,
        expectedNoShows: 0,
        overbookRecommendation: "DENY",
        riskBand: "LOW",
        rationale: "no live bookings yet",
        perBooking: [],
      };
    }

    // Cache by the fingerprint of (live booking ids + overbook factor). If
    // any booking is added or cancelled the fingerprint changes, so the cache
    // entry naturally becomes a miss without a separate invalidation call.
    const cacheKey = buildAdviceCacheKey(
      classId,
      context.liveBookings.map((b) => b.id),
      this.overbookFactor,
    );
    const cached = await this.redis.getJson<NoShowAdvisorResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`advice cache hit for ${classId}`);
      return cached;
    }

    const prompt = buildAdvisorPrompt(context);
    const completion = await this.grok.chat({
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that estimates per-booking show probabilities " +
            "for a gym class and recommends whether overbooking is safe. " +
            "Respond with STRICT JSON matching the schema given by the user. " +
            "No commentary outside the JSON object.",
        },
        { role: "user", content: prompt },
      ],
      responseFormat: "json",
      temperature: 0.1,
    });

    let raw: unknown;
    try {
      raw = JSON.parse(completion.content);
    } catch {
      throw new Error(`advisor returned non-JSON: ${completion.content.slice(0, 200)}`);
    }
    const parsed = NoShowAdvisorResponseSchema.parse(raw);

    await this.redis.setJson(cacheKey, parsed, this.cacheTtl);

    await this.decisions.record({
      classId,
      model: completion.model,
      prompt,
      response: completion.content,
      expectedAttendance: parsed.expectedAttendance,
      overbookAllowed: parsed.overbookRecommendation === "ALLOW",
      riskBand: parsed.riskBand,
      rationale: parsed.rationale,
      latencyMs: completion.latencyMs,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });

    return parsed;
  }

  decisionHistory(limit = 30) {
    return this.decisions.history(limit);
  }

  private async capacityOf(classId: string): Promise<number> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { capacity: true },
    });
    if (!klass) throw new NotFoundException("class not found");
    return klass.capacity;
  }

  private async gatherContext(classId: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        trainer: { select: { name: true } },
        bookings: {
          where: { status: { in: ["ACTIVE", "PROMOTED"] } },
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                tenureStart: true,
                cohort: true,
                attendance: {
                  orderBy: { recordedAt: "desc" },
                  take: 10,
                  select: { showed: true },
                },
              },
            },
          },
        },
      },
    });
    if (!klass) throw new NotFoundException("class not found");

    return {
      class: klass,
      liveBookings: klass.bookings,
    };
  }

}
