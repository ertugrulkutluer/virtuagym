import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface RecordDecisionInput {
  classId: string;
  model: string;
  prompt: string;
  response: string;
  expectedAttendance: number;
  overbookAllowed: boolean;
  riskBand: string;
  rationale: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

@Injectable()
export class AiDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordDecisionInput) {
    return this.prisma.aiDecisionLog.create({ data: input });
  }

  history(limit = 30) {
    return this.prisma.aiDecisionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  latestForClass(classId: string) {
    return this.prisma.aiDecisionLog.findFirst({
      where: { classId },
      orderBy: { createdAt: "desc" },
    });
  }
}
