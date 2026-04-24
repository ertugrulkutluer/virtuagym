import { z } from "zod";
import { ClassCategory } from "../constants/class-category";
import { MarkerInterpretation } from "../constants/marker-interpretation";

const ClassCategoryEnum = z.nativeEnum(ClassCategory);
const MarkerInterpretationEnum = z.nativeEnum(MarkerInterpretation);

// ── Input: raw markers from user (manual or edited from PDF preview) ───

export const RawBloodMarkerSchema = z.object({
  canonicalName: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  value: z.number().finite(),
  unit: z.string().min(1).max(32),
  refLow: z.number().finite().nullable().optional(),
  refHigh: z.number().finite().nullable().optional(),
});
export type RawBloodMarkerInput = z.infer<typeof RawBloodMarkerSchema>;

export const CreateBloodTestReportSchema = z.object({
  collectedAt: z.string().datetime().optional(),
  labName: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  source: z.enum(["MANUAL", "PDF_UPLOAD"]).default("MANUAL"),
  rawText: z.string().max(50_000).optional(),
  markers: z.array(RawBloodMarkerSchema).min(1).max(50),
});
export type CreateBloodTestReportInput = z.infer<typeof CreateBloodTestReportSchema>;

// ── LLM contract: PDF extraction ──────────────────────────────────────

export const ExtractedMarkerSchema = z.object({
  rawLabel: z.string().min(1).max(200),
  canonicalName: z.string().max(64).nullable(),
  value: z.number().finite().nullable(),
  unit: z.string().max(32).nullable(),
  refLow: z.number().finite().nullable(),
  refHigh: z.number().finite().nullable(),
});

export const ReportExtractionResponseSchema = z.object({
  collectedAt: z.string().nullable(),
  labName: z.string().nullable(),
  markers: z.array(ExtractedMarkerSchema).max(80),
});
export type ReportExtractionResponse = z.infer<typeof ReportExtractionResponseSchema>;

// ── LLM contract: program recommendation ──────────────────────────────

export const PerMarkerGuidanceSchema = z.object({
  canonicalName: z.string().min(1).max(64),
  interpretation: MarkerInterpretationEnum,
  explanation: z.string().min(1).max(400),
  impact: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]),
  suggestedCategories: z.array(ClassCategoryEnum).max(6),
  avoidCategories: z.array(ClassCategoryEnum).max(6),
});

export const ProgramRecommendationResponseSchema = z.object({
  readinessScore: z.number().int().min(0).max(100),
  recommendedCategories: z.array(ClassCategoryEnum).max(6),
  avoidCategories: z.array(ClassCategoryEnum).max(6),
  perMarker: z.array(PerMarkerGuidanceSchema).max(30),
  weeklyPlan: z.string().min(1).max(1200),
  warnings: z.array(z.string().max(240)).max(8),
  summary: z.string().min(1).max(800),
});
export type ProgramRecommendationResponse = z.infer<
  typeof ProgramRecommendationResponseSchema
>;
