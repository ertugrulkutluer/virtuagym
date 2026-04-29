import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  ProgramRecommendationResponseSchema,
  type ProgramRecommendationResponse,
} from "@gymflow/shared";
import { GrokClient } from "../../core/grok/grok.service";
import { BloodworkRepository } from "./bloodwork.repository";
import {
  buildAnalyzerSystemPrompt,
  buildAnalyzerUserPrompt,
  hashAnalyzerInput,
  sanitizeRecommendation,
  type AnalysisInput,
} from "./analyzer.helpers";

export type { AnalysisInput };

export interface AnalysisOutput {
  response: ProgramRecommendationResponse;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cached: boolean;
}

/**
 * Single LLM pass over already-classified markers. The rule layer owns the
 * interpretation bands; Grok owns the exercise-programming judgment on top.
 */
@Injectable()
export class BloodworkAnalyzer {
  private readonly logger = new Logger(BloodworkAnalyzer.name);

  constructor(
    private readonly grok: GrokClient,
    private readonly repo: BloodworkRepository,
  ) {}

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const system = buildAnalyzerSystemPrompt();
    const user = buildAnalyzerUserPrompt(input);
    const inputHash = hashAnalyzerInput(system, user);

    // Content-addressable cache in Postgres — identical prompt replays the
    // stored Grok response, bumps hitCount, and skips the round-trip.
    const hit = await this.repo.findAnalysisCache(inputHash);
    if (hit) {
      this.logger.debug(`analysis cache hit ${inputHash}`);
      void this.repo.recordAnalysisCacheHit(inputHash).catch(() => undefined);
      return {
        response: hit.response as unknown as ProgramRecommendationResponse,
        model: hit.model,
        latencyMs: 0,
        promptTokens: hit.promptTokens,
        completionTokens: hit.completionTokens,
        cached: true,
      };
    }

    const res = await this.grok.chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      responseFormat: "json",
      temperature: 0.15,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.content);
    } catch {
      this.logger.error(`grok non-JSON: ${res.content.slice(0, 500)}`);
      throw new BadRequestException({
        error: "analysis_parse_failed",
        message: "AI returned non-JSON.",
      });
    }

    const validated = ProgramRecommendationResponseSchema.safeParse(parsed);
    if (!validated.success) {
      this.logger.error(
        `analysis schema fail: ${JSON.stringify(validated.error.issues).slice(0, 800)}`,
      );
      throw new BadRequestException({
        error: "analysis_schema_mismatch",
        message: "AI response had the wrong shape.",
      });
    }

    const sanitized = sanitizeRecommendation(validated.data);
    await this.repo.upsertAnalysisCache({
      inputHash,
      model: res.model,
      response: sanitized,
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: res.usage?.completion_tokens ?? null,
      latencyMs: res.latencyMs,
    });

    return {
      response: sanitized,
      model: res.model,
      latencyMs: res.latencyMs,
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: res.usage?.completion_tokens ?? null,
      cached: false,
    };
  }

}
