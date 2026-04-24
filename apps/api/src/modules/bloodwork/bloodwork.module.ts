import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { MembersModule } from "../members/members.module";
import { BloodworkAnalyzer } from "./analyzer.service";
import { BloodworkClassifier } from "./classifier.service";
import { BloodworkController } from "./bloodwork.controller";
import { BloodworkRepository } from "./bloodwork.repository";
import { BloodworkService } from "./bloodwork.service";
import { PdfExtractor } from "./pdf-extractor.service";

@Module({
  imports: [AiModule, MembersModule],
  controllers: [BloodworkController],
  providers: [
    BloodworkClassifier,
    BloodworkAnalyzer,
    PdfExtractor,
    BloodworkRepository,
    BloodworkService,
  ],
  exports: [BloodworkService, BloodworkClassifier],
})
export class BloodworkModule {}
