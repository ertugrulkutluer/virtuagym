import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AppConfigModule } from "../../config/config.module";
import { EnvService } from "../../config/env.service";
import { RealtimeGateway } from "./realtime.gateway";

@Global()
@Module({
  imports: [
    AppConfigModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        secret: env.get("JWT_SECRET"),
      }),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
