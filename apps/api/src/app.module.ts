import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import type Redis from "ioredis";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { IdempotencyInterceptor } from "./common/interceptors/idempotency.interceptor";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { AppConfigModule } from "./config/config.module";
import { EnvService } from "./config/env.service";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { REDIS_CLIENT } from "./core/redis/redis.service";
import { AiModule } from "./modules/ai/ai.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BloodworkModule } from "./modules/bloodwork/bloodwork.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { ClassesModule } from "./modules/classes/classes.module";
import { HealthModule } from "./modules/health/health.module";
import { MembersModule } from "./modules/members/members.module";
import { TrainersModule } from "./modules/trainers/trainers.module";

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT, EnvService],
      useFactory: (redis: Redis, env: EnvService) => ({
        throttlers: [
          { name: "default", ttl: 60_000, limit: 240 },
          { name: "ai", ttl: 60_000, limit: env.get("AI_RATE_LIMIT_PER_MINUTE") },
          {
            name: "booking",
            ttl: 60_000,
            limit: env.get("BOOKING_RATE_LIMIT_PER_MINUTE"),
          },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    AuthModule,
    HealthModule,
    ClassesModule,
    MembersModule,
    TrainersModule,
    AiModule,
    BookingsModule,
    BloodworkModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
