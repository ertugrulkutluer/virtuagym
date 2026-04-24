import { Module } from "@nestjs/common";
import { ClassesController } from "./classes.controller";
import { ClassesRepository } from "./classes.repository";
import { ClassesService } from "./classes.service";

@Module({
  controllers: [ClassesController],
  providers: [ClassesRepository, ClassesService],
  exports: [ClassesService, ClassesRepository],
})
export class ClassesModule {}
