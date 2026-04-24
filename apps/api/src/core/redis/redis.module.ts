import { Global, Module } from "@nestjs/common";
import { EnvService } from "../../config/env.service";
import { REDIS_CLIENT, RedisService, buildRedisFactory } from "./redis.service";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (env: EnvService) => buildRedisFactory(env),
      inject: [EnvService],
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
