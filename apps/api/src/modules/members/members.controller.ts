import { Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  type AuthUser,
  CreateMemberInput,
  CreateMemberSchema,
  GrantCreditsInput,
  GrantCreditsSchema,
  ListMembersQuery,
  ListMembersQuerySchema,
  Role,
  UpdateMemberInput,
  UpdateMemberSchema,
} from "@gymflow/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { ZodQuery } from "../../common/decorators/zod-query.decorator";
import { MembersService } from "./members.service";

@ApiTags("members")
@ApiBearerAuth()
@Controller("members")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.members.getByUserId(user.id);
  }

  @Roles(Role.ADMIN)
  @Get()
  list(@ZodQuery(ListMembersQuerySchema) query: ListMembersQuery) {
    return this.members.list(query);
  }

  @Roles(Role.ADMIN)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.members.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@ZodBody(CreateMemberSchema) input: CreateMemberInput) {
    return this.members.create(input);
  }

  @Roles(Role.ADMIN)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @ZodBody(UpdateMemberSchema) input: UpdateMemberInput,
  ) {
    return this.members.update(id, input);
  }

  @Roles(Role.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.members.remove(id);
  }

  @Roles(Role.ADMIN)
  @Post(":id/credits")
  grantCredits(
    @Param("id") id: string,
    @ZodBody(GrantCreditsSchema) input: GrantCreditsInput,
  ) {
    return this.members.grantCredits(id, input);
  }
}
