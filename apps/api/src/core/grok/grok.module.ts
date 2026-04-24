import { Global, Module } from "@nestjs/common";
import { AppConfigModule } from "../../config/config.module";
import { GrokClient } from "./grok.service";

/**
 * Infrastructure: the xAI Grok HTTP client. Sits at the same layer as
 * Prisma and Redis — every feature module that wants to call an LLM
 * consumes this one typed wrapper instead of rolling its own axios call.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [GrokClient],
  exports: [GrokClient],
})
export class GrokModule {}
