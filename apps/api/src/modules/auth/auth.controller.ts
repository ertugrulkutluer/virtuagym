import { Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  type AuthUser,
  LoginInput,
  LoginSchema,
  RegisterInput,
  RegisterSchema,
} from "@gymflow/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  register(@ZodBody(RegisterSchema) input: RegisterInput) {
    return this.auth.register(input);
  }

  @Public()
  @HttpCode(200)
  @Post("login")
  login(@ZodBody(LoginSchema) input: LoginInput) {
    return this.auth.login(input);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
