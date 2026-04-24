import { Module } from "@nestjs/common";
import { MembersModule } from "../members/members.module";
import { OverbookingModule } from "../overbooking/overbooking.module";
import { BookingsController } from "./bookings.controller";
import { BookingsRepository } from "./bookings.repository";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [MembersModule, OverbookingModule],
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService],
  exports: [BookingsService, BookingsRepository],
})
export class BookingsModule {}
