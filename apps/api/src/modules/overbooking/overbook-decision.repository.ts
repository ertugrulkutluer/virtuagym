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
export class OverbookDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordDecisionInput) {
    return this.prisma.overbookDecisionLog.create({ data: input });
  }

  history(limit = 30) {
    return this.prisma.overbookDecisionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  latestForClass(classId: string) {
    return this.prisma.overbookDecisionLog.findFirst({
      where: { classId },
      orderBy: { createdAt: "desc" },
    });
  }
}
