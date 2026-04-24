import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { MembersModule } from "../members/members.module";
import { BookingsController } from "./bookings.controller";
import { BookingsRepository } from "./bookings.repository";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [MembersModule, AiModule],
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService],
  exports: [BookingsService, BookingsRepository],
})
export class BookingsModule {}
