import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClassCategory, MarkerInterpretation, ReportSource } from "@prisma/client";
import {
  resolveCanonicalMarkerName,
  type CreateBloodTestReportInput,
  type ProgramRecommendationResponse,
} from "@gymflow/shared";
import { BloodworkAnalyzer } from "./analyzer.service";
import { BloodworkClassifier } from "./classifier.service";
import { BloodworkRepository, type ReportWithDetails } from "./bloodwork.repository";
import { PdfExtractor, type ExtractionResult } from "./pdf-extractor.service";

const VALID_FOR_DAYS = 7;

@Injectable()
export class BloodworkService {
  private readonly logger = new Logger(BloodworkService.name);

  constructor(
    private readonly classifier: BloodworkClassifier,
    private readonly analyzer: BloodworkAnalyzer,
    private readonly pdfExtractor: PdfExtractor,
    private readonly repo: BloodworkRepository,
  ) {}

  extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    return this.pdfExtractor.extract(buffer);
  }

  /**
   * Orchestration for the "save + analyze" step.
   * 1. Normalise each incoming marker (resolve canonical name, enforce known unit).
   * 2. Run the rule-based classifier → interpretation bands.
   * 3. Call the single-stage analyzer with stratified markers.
   * 4. Persist report + markers + recommendation atomically.
   */
  async createReportWithAnalysis(memberId: string, input: CreateBloodTestReportInput) {
    const normalised = this.normaliseMarkers(input.markers);
    if (normalised.length === 0) {
      throw new BadRequestException({
        error: "no_recognised_markers",
        message: "None of the supplied markers match our catalog.",
      });
    }

    const stratified = this.classifier.stratify(normalised);
    const previous = await this.repo.latestRecommendationForMember(memberId);

    const analysis = await this.analyzer.analyze({
      stratified,
      previousSummary: previous
        ? {
            readinessScore: previous.readinessScore,
            createdAt: previous.createdAt.toISOString(),
            outOfRange: stratified.outOfRange.map((m) => ({
              canonicalName: m.canonicalName,
              interpretation: m.interpretation,
            })),
          }
        : null,
    });

    const classifiedForPersist = this.classifier.classify(normalised);

    return this.repo.runInTransaction(async (tx) => {
      const report = await this.repo.createReport(tx, {
        memberId,
        source:
          input.source === "PDF_UPLOAD"
            ? ReportSource.PDF_UPLOAD
            : ReportSource.MANUAL,
        collectedAt: input.collectedAt ? new Date(input.collectedAt) : null,
        labName: input.labName ?? null,
        notes: input.notes ?? null,
        rawText: input.rawText ?? null,
        markers: classifiedForPersist.map((m) => ({
          canonicalName: m.canonicalName,
          label: m.label,
          value: m.value,
          unit: m.unit,
          refLow: m.refLow,
          refHigh: m.refHigh,
          interpretation: this.toPrismaInterpretation(m.interpretation),
        })),
      });

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + VALID_FOR_DAYS);

      const recommendation = await this.repo.createRecommendation(tx, {
        memberId,
        reportId: report.id,
        readinessScore: analysis.response.readinessScore,
        recommendedCategories: analysis.response.recommendedCategories.map(
          (c) => c as ClassCategory,
        ),
        avoidCategories: analysis.response.avoidCategories.map(
          (c) => c as ClassCategory,
        ),
        perMarker: analysis.response.perMarker,
        weeklyPlan: analysis.response.weeklyPlan,
        warnings: analysis.response.warnings,
        summary: analysis.response.summary,
        model: analysis.model,
        promptTokens: analysis.promptTokens,
        completionTokens: analysis.completionTokens,
        latencyMs: analysis.latencyMs,
        validUntil,
      });

      return { report, recommendation, analysis: analysis.response };
    });
  }

  async getReport(id: string, memberId: string | null): Promise<ReportWithDetails> {
    const found = await this.repo.findReportById(id, memberId ?? undefined);
    if (!found) throw new NotFoundException("report not found");
    return found;
  }

  listForMember(memberId: string) {
    return this.repo.listByMember(memberId);
  }

  latestForMember(memberId: string) {
    return this.repo.latestForMember(memberId);
  }

  latestRecommendationForMember(memberId: string) {
    return this.repo.latestRecommendationForMember(memberId);
  }

  // ── helpers ─────────────────────────────────────────────────

  private normaliseMarkers(
    inputs: CreateBloodTestReportInput["markers"],
  ) {
    const out: CreateBloodTestReportInput["markers"] = [];
    const seen = new Set<string>();
    for (const m of inputs) {
      const canonical =
        resolveCanonicalMarkerName(m.canonicalName) ??
        resolveCanonicalMarkerName(m.label);
      if (!canonical) continue; // drop unknown — keeps the catalog the source of truth
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      out.push({ ...m, canonicalName: canonical });
    }
    return out;
  }

  private toPrismaInterpretation(i: string): MarkerInterpretation {
    switch (i) {
      case "LOW":
        return MarkerInterpretation.LOW;
      case "BORDERLINE_LOW":
        return MarkerInterpretation.BORDERLINE_LOW;
      case "NORMAL":
        return MarkerInterpretation.NORMAL;
      case "BORDERLINE_HIGH":
        return MarkerInterpretation.BORDERLINE_HIGH;
      case "HIGH":
        return MarkerInterpretation.HIGH;
      default:
        return MarkerInterpretation.UNKNOWN;
    }
  }
}

export type { ProgramRecommendationResponse };
