import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";

export interface CreateTrainerInput {
  name: string;
}

@Injectable()
export class TrainersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.trainer.findMany({ orderBy: { name: "asc" } });
  }

  create(input: CreateTrainerInput) {
    return this.prisma.trainer.create({ data: input });
  }

  remove(id: string) {
    return this.prisma.trainer.delete({ where: { id } });
  }
}
