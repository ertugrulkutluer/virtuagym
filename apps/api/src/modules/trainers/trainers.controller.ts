import { Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@gymflow/shared";
import { z } from "zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodBody } from "../../common/decorators/zod-body.decorator";
import { TrainersService } from "./trainers.service";

const CreateTrainerSchema = z.object({
  name: z.string().min(1).max(80),
});
type CreateTrainerInput = z.infer<typeof CreateTrainerSchema>;

@ApiTags("trainers")
@ApiBearerAuth()
@Controller("trainers")
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Get()
  list() {
    return this.trainers.list();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@ZodBody(CreateTrainerSchema) input: CreateTrainerInput) {
    return this.trainers.create(input);
  }

  @Roles(Role.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.trainers.remove(id);
  }
}
