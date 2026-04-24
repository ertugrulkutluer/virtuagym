import { Injectable } from "@nestjs/common";
import {
  BloodMarker,
  BloodTestReport,
  ClassCategory,
  MarkerInterpretation,
  Prisma,
  ProgramRecommendation,
  ReportSource,
} from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";

type Tx = Prisma.TransactionClient;

export interface ReportWithDetails extends BloodTestReport {
  markers: BloodMarker[];
  recommendation: ProgramRecommendation | null;
}

export interface CreateReportInput {
  memberId: string;
  source: ReportSource;
  collectedAt: Date | null;
  labName: string | null;
  notes: string | null;
  rawText: string | null;
  markers: Array<{
    canonicalName: string;
    label: string;
    value: number;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
    interpretation: MarkerInterpretation;
  }>;
}

export interface CreateRecommendationInput {
  memberId: string;
  reportId: string;
  readinessScore: number;
  recommendedCategories: ClassCategory[];
  avoidCategories: ClassCategory[];
  perMarker: unknown;
  weeklyPlan: string;
  warnings: string[];
  summary: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  validUntil: Date;
}

@Injectable()
export class BloodworkRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  createReport(tx: Tx, input: CreateReportInput) {
    return tx.bloodTestReport.create({
      data: {
        memberId: input.memberId,
        source: input.source,
        collectedAt: input.collectedAt ?? undefined,
        labName: input.labName ?? undefined,
        notes: input.notes ?? undefined,
        rawText: input.rawText ?? undefined,
        markers: {
          create: input.markers.map((m) => ({
            canonicalName: m.canonicalName,
            label: m.label,
            value: m.value,
            unit: m.unit,
            refLow: m.refLow ?? undefined,
            refHigh: m.refHigh ?? undefined,
            interpretation: m.interpretation,
          })),
        },
      },
      include: { markers: true },
    });
  }

  createRecommendation(tx: Tx, input: CreateRecommendationInput) {
    return tx.programRecommendation.create({
      data: {
        memberId: input.memberId,
        reportId: input.reportId,
        readinessScore: input.readinessScore,
        recommendedCategories: input.recommendedCategories,
        avoidCategories: input.avoidCategories,
        perMarker: input.perMarker as Prisma.InputJsonValue,
        weeklyPlan: input.weeklyPlan,
        warnings: input.warnings,
        summary: input.summary,
        model: input.model,
        promptTokens: input.promptTokens ?? undefined,
        completionTokens: input.completionTokens ?? undefined,
        latencyMs: input.latencyMs,
        validUntil: input.validUntil,
      },
    });
  }

  async findReportById(id: string, memberId?: string): Promise<ReportWithDetails | null> {
    return this.prisma.bloodTestReport.findFirst({
      where: { id, ...(memberId ? { memberId } : {}) },
      include: { markers: true, recommendation: true },
    });
  }

  listByMember(memberId: string, limit = 20): Promise<ReportWithDetails[]> {
    return this.prisma.bloodTestReport.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { markers: true, recommendation: true },
    });
  }

  latestForMember(memberId: string): Promise<ReportWithDetails | null> {
    return this.prisma.bloodTestReport.findFirst({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      include: { markers: true, recommendation: true },
    });
  }

  latestRecommendationForMember(
    memberId: string,
  ): Promise<ProgramRecommendation | null> {
    return this.prisma.programRecommendation.findFirst({
      where: { memberId },
      orderBy: { createdAt: "desc" },
    });
  }
}
