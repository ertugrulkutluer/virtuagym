import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiDecisionRepository } from "./ai-decision.repository";
import { GrokClient } from "./grok-client.service";
import { NoShowAdvisor } from "./no-show-advisor.service";

@Module({
  controllers: [AiController],
  providers: [GrokClient, AiDecisionRepository, NoShowAdvisor],
  exports: [NoShowAdvisor, GrokClient],
})
export class AiModule {}
