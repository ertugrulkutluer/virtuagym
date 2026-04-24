import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  type AuthUser,
  CheckInInput,
  CheckInSchema,
  CreateBookingInput,
  CreateBookingSchema,
  Role,
} from "@gymflow/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Idempotent } from "../../common/decorators/idempotent.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { MembersService } from "../members/members.service";
import { BookingsService } from "./bookings.service";

@ApiTags("bookings")
@ApiBearerAuth()
@Controller("bookings")
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly members: MembersService,
  ) {}

  @Idempotent()
  @Throttle({ booking: { limit: 60, ttl: 60_000 } })
  @Post()
  async book(
    @CurrentUser() user: AuthUser,
    @ZodBody(CreateBookingSchema) input: CreateBookingInput,
  ) {
    const me = await this.members.getByUserId(user.id);
    return this.bookings.book(me.id, input.classId);
  }

  @Get("me")
  async myBookings(@CurrentUser() user: AuthUser) {
    const me = await this.members.getByUserId(user.id);
    return this.bookings.listForMember(me.id);
  }

  @Roles(Role.ADMIN)
  @Get("by-class/:classId")
  byClass(@Param("classId") classId: string) {
    return this.bookings.listForClass(classId);
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const b = await this.bookings.get(id);
    if (user.role !== "ADMIN") {
      const me = await this.members.getByUserId(user.id);
      if (b.memberId !== me.id) {
        throw new BadRequestException("not your booking");
      }
    }
    return b;
  }

  @Idempotent()
  @Delete(":id")
  async cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const isAdmin = user.role === "ADMIN";
    const me = isAdmin ? null : await this.members.getByUserId(user.id);
    return this.bookings.cancel(id, me?.id ?? null, isAdmin);
  }

  @Idempotent()
  @Roles(Role.ADMIN)
  @Post(":id/check-in")
  checkIn(
    @Param("id") id: string,
    @ZodBody(CheckInSchema) input: CheckInInput,
  ) {
    return this.bookings.checkIn(id, input.method);
  }

  @Roles(Role.ADMIN)
  @Post("classes/:classId/close")
  closeClass(@Param("classId") classId: string) {
    return this.bookings.closeClass(classId);
  }
}
