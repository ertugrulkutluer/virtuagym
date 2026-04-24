import { Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  CreateClassInput,
  CreateClassSchema,
  ListClassesQuery,
  ListClassesQuerySchema,
  Role,
  UpdateClassInput,
  UpdateClassSchema,
} from "@gymflow/shared";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { ZodQuery } from "../../common/decorators/zod-query.decorator";
import { ClassesService } from "./classes.service";

@ApiTags("classes")
@ApiBearerAuth()
@Controller("classes")
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Public()
  @Get()
  list(@ZodQuery(ListClassesQuerySchema) query: ListClassesQuery) {
    return this.classes.list(query);
  }

  @Public()
  @Get(":id")
  get(@Param("id") id: string) {
    return this.classes.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@ZodBody(CreateClassSchema) input: CreateClassInput) {
    return this.classes.create(input);
  }

  @Roles(Role.ADMIN)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @ZodBody(UpdateClassSchema) input: UpdateClassInput,
  ) {
    return this.classes.update(id, input);
  }

  @Roles(Role.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.classes.remove(id);
  }
}
