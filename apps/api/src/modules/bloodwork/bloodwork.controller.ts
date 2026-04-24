import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  CreateBloodTestReportSchema,
  type AuthUser,
  type CreateBloodTestReportInput,
} from "@gymflow/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Idempotent } from "../../common/decorators/idempotent.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { MembersService } from "../members/members.service";
import { BloodworkService } from "./bloodwork.service";

const PDF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

@ApiTags("bloodwork")
@ApiBearerAuth()
@Controller("bloodwork")
export class BloodworkController {
  constructor(
    private readonly bloodwork: BloodworkService,
    private readonly members: MembersService,
  ) {}

  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post("extract")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async extract(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /pdf$/i })
        .addMaxSizeValidator({ maxSize: PDF_MAX_BYTES })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("file missing");
    }
    return this.bloodwork.extractFromPdf(file.buffer);
  }

  @Idempotent()
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post("reports")
  async create(
    @CurrentUser() user: AuthUser,
    @ZodBody(CreateBloodTestReportSchema) input: CreateBloodTestReportInput,
  ) {
    const me = await this.members.getByUserId(user.id);
    return this.bloodwork.createReportWithAnalysis(user.id, me.id, input);
  }

  @Get("reports/me")
  async listMine(@CurrentUser() user: AuthUser) {
    const me = await this.members.getByUserId(user.id);
    return this.bloodwork.listForMember(me.id);
  }

  @Get("reports/me/latest")
  async latestMine(@CurrentUser() user: AuthUser) {
    const me = await this.members.getByUserId(user.id);
    return this.bloodwork.latestForMember(me.id);
  }

  @Get("recommendations/me/latest")
  async latestRecommendation(@CurrentUser() user: AuthUser) {
    const me = await this.members.getByUserId(user.id);
    return this.bloodwork.latestRecommendationForMember(me.id);
  }

  @Get("reports/:id")
  async get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const memberId =
      user.role === "ADMIN" ? null : (await this.members.getByUserId(user.id)).id;
    return this.bloodwork.getReport(id, memberId);
  }
}
