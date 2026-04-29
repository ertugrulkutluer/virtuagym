import {
  buildAnalyzerSystemPrompt,
  buildAnalyzerUserPrompt,
  hashAnalyzerInput,
  sanitizeRecommendation,
  type AnalysisInput,
} from "./analyzer.helpers";
import type { ClassifiedMarker, StratifiedMarkers } from "./classifier.service";
import type { ProgramRecommendationResponse } from "@gymflow/shared";

const marker = (
  overrides: Partial<ClassifiedMarker> = {},
): ClassifiedMarker => ({
  canonicalName: "hemoglobin",
  label: "Hemoglobin",
  value: 14,
  unit: "g/dL",
  refLow: 13.5,
  refHigh: 17.5,
  interpretation: "NORMAL",
  category: "hematology",
  ...overrides,
});

const emptyStratified = (): StratifiedMarkers => ({
  outOfRange: [],
  borderline: [],
  normal: [],
  unknown: [],
});

describe("hashAnalyzerInput", () => {
  it("is deterministic for identical inputs", () => {
    expect(hashAnalyzerInput("a", "b")).toBe(hashAnalyzerInput("a", "b"));
  });

  it("changes when either side changes", () => {
    const base = hashAnalyzerInput("a", "b");
    expect(hashAnalyzerInput("a2", "b")).not.toBe(base);
    expect(hashAnalyzerInput("a", "b2")).not.toBe(base);
  });

  it("does not collide across the system/user boundary", () => {
    // "a" + "bc" must not hash the same as "ab" + "c"
    expect(hashAnalyzerInput("a", "bc")).not.toBe(hashAnalyzerInput("ab", "c"));
  });
});

describe("buildAnalyzerSystemPrompt", () => {
  it("lists the allowed class categories and JSON contract", () => {
    const out = buildAnalyzerSystemPrompt();
    expect(out).toContain("readinessScore");
    expect(out).toContain("perMarker");
    expect(out).toContain("ClassCategory ∈");
    expect(out).toContain("Output JSON only.");
  });
});

describe("buildAnalyzerUserPrompt", () => {
  it("groups markers by stratification bucket", () => {
    const input: AnalysisInput = {
      stratified: {
        ...emptyStratified(),
        outOfRange: [marker({ interpretation: "LOW" })],
        borderline: [marker({ canonicalName: "ferritin", interpretation: "BORDERLINE_LOW" })],
        normal: [marker({ canonicalName: "vitamin_d", interpretation: "NORMAL" })],
      },
    };
    const out = buildAnalyzerUserPrompt(input);
    expect(out).toContain("## Out of range");
    expect(out).toContain("hemoglobin");
    expect(out).toContain("## Borderline");
    expect(out).toContain("ferritin");
    expect(out).toContain("## Normal");
  });

  it("renders empty buckets as (none)", () => {
    const out = buildAnalyzerUserPrompt({ stratified: emptyStratified() });
    expect(out.match(/\(none\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("includes the unknown section only when there are unknowns", () => {
    const without = buildAnalyzerUserPrompt({ stratified: emptyStratified() });
    expect(without).not.toContain("## Unknown");

    const withUnknown = buildAnalyzerUserPrompt({
      stratified: {
        ...emptyStratified(),
        unknown: [marker({ interpretation: "UNKNOWN" })],
      },
    });
    expect(withUnknown).toContain("## Unknown");
  });

  it("includes previous summary block when provided", () => {
    const out = buildAnalyzerUserPrompt({
      stratified: emptyStratified(),
      previousSummary: {
        readinessScore: 78,
        createdAt: "2025-01-01T00:00:00Z",
        outOfRange: [{ canonicalName: "ferritin", interpretation: "LOW" }],
      },
    });
    expect(out).toContain("readinessScore: 78");
    expect(out).toContain("ferritin=LOW");
  });
});

describe("sanitizeRecommendation", () => {
  it("strips unknown categories from top-level and per-marker arrays", () => {
    const input = {
      readinessScore: 80,
      recommendedCategories: ["HIIT", "BOGUS"],
      avoidCategories: ["YOGA", "ALSO_BOGUS"],
      perMarker: [
        {
          canonicalName: "hemoglobin",
          interpretation: "NORMAL",
          explanation: "ok",
          impact: "LOW",
          suggestedCategories: ["RECOVERY", "NOPE"],
          avoidCategories: ["BAD"],
        },
      ],
      weeklyPlan: "plan",
      warnings: [],
      summary: "summary",
    } as unknown as ProgramRecommendationResponse;

    const out = sanitizeRecommendation(input);
    expect(out.recommendedCategories).toEqual(["HIIT"]);
    expect(out.avoidCategories).toEqual(["YOGA"]);
    expect(out.perMarker[0]!.suggestedCategories).toEqual(["RECOVERY"]);
    expect(out.perMarker[0]!.avoidCategories).toEqual([]);
  });

  it("preserves other fields untouched", () => {
    const input = {
      readinessScore: 60,
      recommendedCategories: [],
      avoidCategories: [],
      perMarker: [],
      weeklyPlan: "p",
      warnings: ["w"],
      summary: "s",
    } as unknown as ProgramRecommendationResponse;
    const out = sanitizeRecommendation(input);
    expect(out.weeklyPlan).toBe("p");
    expect(out.warnings).toEqual(["w"]);
    expect(out.summary).toBe("s");
    expect(out.readinessScore).toBe(60);
  });
});
