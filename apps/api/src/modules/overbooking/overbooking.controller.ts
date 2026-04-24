import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { AiToggleInput, AiToggleSchema, Role } from "@gymflow/shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { NoShowAdvisor } from "./no-show-advisor.service";

@ApiTags("overbooking")
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Throttle({ ai: { limit: 30, ttl: 60_000 } })
@Controller("overbooking")
export class OverbookingController {
  constructor(private readonly advisor: NoShowAdvisor) {}

  @SkipThrottle()
  @Get("status")
  status() {
    return {
      enabled: this.advisor.isEnabled(),
      overbookFactor: this.advisor.getOverbookFactor(),
    };
  }

  @SkipThrottle()
  @Post("toggle")
  toggle(@ZodBody(AiToggleSchema) input: AiToggleInput) {
    if (input.enabled !== undefined) this.advisor.setEnabled(input.enabled);
    if (input.overbookFactor !== undefined)
      this.advisor.setOverbookFactor(input.overbookFactor);
    return this.status();
  }

  @Get("class/:classId")
  advise(@Param("classId") classId: string) {
    return this.advisor.adviseForClass(classId);
  }

  @SkipThrottle()
  @Get("decisions")
  history(@Query("limit") limit?: string) {
    return this.advisor.decisionHistory(limit ? Number(limit) : 30);
  }
}
