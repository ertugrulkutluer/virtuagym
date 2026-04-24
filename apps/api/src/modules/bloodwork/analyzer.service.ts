import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  ALL_CLASS_CATEGORIES,
  ProgramRecommendationResponseSchema,
  getMarkerDef,
  type ProgramRecommendationResponse,
} from "@gymflow/shared";
import { GrokClient } from "../ai/grok-client.service";
import type { ClassifiedMarker, StratifiedMarkers } from "./classifier.service";

export interface AnalysisInput {
  stratified: StratifiedMarkers;
  previousSummary?: {
    outOfRange: Array<{ canonicalName: string; interpretation: string }>;
    readinessScore: number | null;
    createdAt: string;
  } | null;
}

export interface AnalysisOutput {
  response: ProgramRecommendationResponse;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * Single LLM pass over already-classified markers. The rule layer owns the
 * interpretation bands; Grok owns the exercise-programming judgment on top.
 */
@Injectable()
export class BloodworkAnalyzer {
  private readonly logger = new Logger(BloodworkAnalyzer.name);

  constructor(private readonly grok: GrokClient) {}

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const system = this.buildSystemPrompt();
    const user = this.buildUserPrompt(input);

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

    return {
      response: this.sanitize(validated.data),
      model: res.model,
      latencyMs: res.latencyMs,
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: res.usage?.completion_tokens ?? null,
    };
  }

  private buildSystemPrompt(): string {
    return [
      "You are a fitness programming assistant that reads already-classified blood-test markers and proposes a one-week gym plan.",
      "IMPORTANT: The rule layer has already bucketed each marker into LOW / BORDERLINE_LOW / NORMAL / BORDERLINE_HIGH / HIGH / UNKNOWN. DO NOT re-interpret numeric values yourself — trust the interpretation band.",
      "Return STRICT JSON matching this TypeScript type:",
      "{",
      "  readinessScore: number,                  // 0-100; 100 = fully ready for intense training",
      "  recommendedCategories: ClassCategory[],  // picks for this week",
      "  avoidCategories: ClassCategory[],        // categories to skip this week",
      "  perMarker: {",
      "    canonicalName: string,",
      "    interpretation: MarkerInterpretation,  // echo the input band",
      "    explanation: string,                   // 1-2 sentences, qualitative (no numeric deltas)",
      "    impact: 'NONE'|'LOW'|'MEDIUM'|'HIGH',",
      "    suggestedCategories: ClassCategory[],",
      "    avoidCategories: ClassCategory[]",
      "  }[],",
      "  weeklyPlan: string,                      // short paragraph prescribing the week (days + intensity)",
      "  warnings: string[],                      // short, actionable cautions",
      "  summary: string                          // 2-3 sentence member-facing motivational summary",
      "}",
      `ClassCategory ∈ { ${ALL_CLASS_CATEGORIES.join(", ")} }`,
      "MarkerInterpretation ∈ { LOW, BORDERLINE_LOW, NORMAL, BORDERLINE_HIGH, HIGH, UNKNOWN }",
      "Rules:",
      "- Never include numbers from the marker values in your prose; use qualitative language ('low', 'at the upper edge', 'normal').",
      "- perMarker entries must echo the interpretation from the input. If input says BORDERLINE_LOW, you must say BORDERLINE_LOW.",
      "- readinessScore should drop more for OUT-OF-RANGE markers than for BORDERLINE ones; UNKNOWN markers do not reduce the score.",
      "- Be conservative with HIIT when iron panel or hemoglobin is low; favour RECOVERY / MOBILITY / YOGA.",
      "- For healthy inputs (all NORMAL), feel free to recommend mixed intensity.",
      "- Output JSON only. No preamble.",
    ].join("\n");
  }

  private buildUserPrompt(input: AnalysisInput): string {
    const describeMarker = (m: ClassifiedMarker) => {
      const def = getMarkerDef(m.canonicalName);
      const hint = def?.exerciseRelevance ? ` — ${def.exerciseRelevance}` : "";
      return `- ${m.canonicalName} (${m.label}) [${m.category}] → ${m.interpretation}${hint}`;
    };

    const lines: string[] = [];
    lines.push("CLASSIFIED MARKERS (interpretation bands are authoritative):");
    lines.push("");
    lines.push("## Out of range");
    lines.push(
      input.stratified.outOfRange.length
        ? input.stratified.outOfRange.map(describeMarker).join("\n")
        : "(none)",
    );
    lines.push("");
    lines.push("## Borderline");
    lines.push(
      input.stratified.borderline.length
        ? input.stratified.borderline.map(describeMarker).join("\n")
        : "(none)",
    );
    lines.push("");
    lines.push("## Normal");
    lines.push(
      input.stratified.normal.length
        ? input.stratified.normal.map(describeMarker).join("\n")
        : "(none)",
    );
    if (input.stratified.unknown.length) {
      lines.push("");
      lines.push("## Unknown / unrecognised");
      lines.push(input.stratified.unknown.map(describeMarker).join("\n"));
    }

    if (input.previousSummary) {
      lines.push("");
      lines.push("## Previous report (for trend context only — do not quote numbers)");
      lines.push(
        `readinessScore: ${input.previousSummary.readinessScore ?? "n/a"}`,
      );
      lines.push(
        `outOfRange: ${input.previousSummary.outOfRange
          .map((m) => `${m.canonicalName}=${m.interpretation}`)
          .join(", ") || "(none)"}`,
      );
    }

    return lines.join("\n");
  }

  /**
   * Defensive cleanup: keep only catalog-known canonical names in perMarker,
   * and ensure avoid/recommended categories are in the allowed set.
   */
  private sanitize(
    r: ProgramRecommendationResponse,
  ): ProgramRecommendationResponse {
    const allowedCategories = new Set(ALL_CLASS_CATEGORIES);
    const cleanList = (xs: string[]) =>
      xs.filter((c) => allowedCategories.has(c as never)) as typeof r.recommendedCategories;

    return {
      ...r,
      recommendedCategories: cleanList(r.recommendedCategories as string[]),
      avoidCategories: cleanList(r.avoidCategories as string[]),
      perMarker: r.perMarker.map((m) => ({
        ...m,
        suggestedCategories: cleanList(m.suggestedCategories as string[]),
        avoidCategories: cleanList(m.avoidCategories as string[]),
      })),
    };
  }
}
