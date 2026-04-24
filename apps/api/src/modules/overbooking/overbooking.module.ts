import { Module } from "@nestjs/common";
import { NoShowAdvisor } from "./no-show-advisor.service";
import { OverbookDecisionRepository } from "./overbook-decision.repository";
import { OverbookingController } from "./overbooking.controller";

@Module({
  controllers: [OverbookingController],
  providers: [NoShowAdvisor, OverbookDecisionRepository],
  exports: [NoShowAdvisor],
})
export class OverbookingModule {}
