import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  BloodTestReport,
  ClassCategory,
  MarkerInterpretation,
  ReportSource,
} from "@prisma/client";
import {
  resolveCanonicalMarkerName,
  type CreateBloodTestReportInput,
  type ProgramRecommendationResponse,
} from "@gymflow/shared";
import { BloodworkAnalyzer } from "./analyzer.service";
import { BloodworkClassifier } from "./classifier.service";
import {
  BloodworkRepository,
  type ReportWithDetails,
} from "./bloodwork.repository";
import { PdfExtractor, type ExtractionResult } from "./pdf-extractor.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const VALID_FOR_DAYS = 7;

export interface CreateReportPendingResponse {
  reportId: string;
  pending: true;
  markers: number;
}

@Injectable()
export class BloodworkService {
  private readonly logger = new Logger(BloodworkService.name);

  constructor(
    private readonly classifier: BloodworkClassifier,
    private readonly analyzer: BloodworkAnalyzer,
    private readonly pdfExtractor: PdfExtractor,
    private readonly repo: BloodworkRepository,
    private readonly realtime: RealtimeGateway,
  ) {}

  extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    return this.pdfExtractor.extract(buffer);
  }

  /**
   * Two-phase orchestration:
   *   Phase 1 (sync): normalise → classify (rules) → persist report + markers
   *     in a transaction. Client gets `{ reportId, pending:true }` ~instantly.
   *   Phase 2 (async): run the analyzer LLM call, persist the recommendation,
   *     emit a socket event. Member's browser picks it up and refreshes —
   *     or, if backgrounded, raises an OS-level notification.
   */
  async createReportWithAnalysis(
    userId: string,
    memberId: string,
    input: CreateBloodTestReportInput,
  ): Promise<CreateReportPendingResponse> {
    const normalised = this.normaliseMarkers(input.markers);
    if (normalised.length === 0) {
      throw new BadRequestException({
        error: "no_recognised_markers",
        message: "None of the supplied markers match our catalog.",
      });
    }

    const classified = this.classifier.classify(normalised);

    const report = await this.repo.runInTransaction((tx) =>
      this.repo.createReport(tx, {
        memberId,
        source:
          input.source === "PDF_UPLOAD"
            ? ReportSource.PDF_UPLOAD
            : ReportSource.MANUAL,
        collectedAt: input.collectedAt ? new Date(input.collectedAt) : null,
        labName: input.labName ?? null,
        notes: input.notes ?? null,
        rawText: input.rawText ?? null,
        markers: classified.map((m) => ({
          canonicalName: m.canonicalName,
          label: m.label,
          value: m.value,
          unit: m.unit,
          refLow: m.refLow,
          refHigh: m.refHigh,
          interpretation: this.toPrismaInterpretation(m.interpretation),
        })),
      }),
    );

    this.realtime.emitToUser(userId, "bloodwork:started", {
      reportId: report.id,
      markers: report.markers.length,
    });

    // Fire-and-forget the analyzer. Errors are caught and emitted as a
    // `bloodwork:failed` event — we never want a stuck socket.
    void this.runAnalysisInBackground(userId, memberId, report);

    return {
      reportId: report.id,
      pending: true,
      markers: report.markers.length,
    };
  }

  private async runAnalysisInBackground(
    userId: string,
    memberId: string,
    report: BloodTestReport & { markers: unknown[] },
  ): Promise<void> {
    try {
      const fresh = await this.repo.findReportById(report.id);
      if (!fresh) throw new Error(`report ${report.id} vanished`);

      const rawMarkers = fresh.markers.map((m) => ({
        canonicalName: m.canonicalName,
        label: m.label,
        value: m.value,
        unit: m.unit,
        refLow: m.refLow,
        refHigh: m.refHigh,
      }));
      const stratified = this.classifier.stratify(rawMarkers);

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

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + VALID_FOR_DAYS);

      const recommendation = await this.repo.runInTransaction((tx) =>
        this.repo.createRecommendation(tx, {
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
        }),
      );

      this.realtime.emitToUser(userId, "bloodwork:completed", {
        reportId: report.id,
        recommendationId: recommendation.id,
        readinessScore: recommendation.readinessScore,
        recommendedCategories: recommendation.recommendedCategories,
        avoidCategories: recommendation.avoidCategories,
        latencyMs: analysis.latencyMs,
      });
    } catch (err) {
      this.logger.error(
        `bg analysis failed report=${report.id}: ${(err as Error).message}`,
      );
      this.realtime.emitToUser(userId, "bloodwork:failed", {
        reportId: report.id,
        message: (err as Error).message,
      });
    }
  }

  async getReport(
    id: string,
    memberId: string | null,
  ): Promise<ReportWithDetails> {
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

  private normaliseMarkers(inputs: CreateBloodTestReportInput["markers"]) {
    const out: CreateBloodTestReportInput["markers"] = [];
    const seen = new Set<string>();
    for (const m of inputs) {
      const canonical =
        resolveCanonicalMarkerName(m.canonicalName) ??
        resolveCanonicalMarkerName(m.label);
      if (!canonical) continue;
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
