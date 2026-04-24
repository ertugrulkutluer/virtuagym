import { Module } from "@nestjs/common";
import { MembersController } from "./members.controller";
import { MembersRepository } from "./members.repository";
import { MembersService } from "./members.service";

@Module({
  controllers: [MembersController],
  providers: [MembersRepository, MembersService],
  exports: [MembersService, MembersRepository],
})
export class MembersModule {}
