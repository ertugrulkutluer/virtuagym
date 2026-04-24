import { Injectable } from "@nestjs/common";
import {
  CreateTrainerInput,
  TrainersRepository,
} from "./trainers.repository";

@Injectable()
export class TrainersService {
  constructor(private readonly repo: TrainersRepository) {}

  list() {
    return this.repo.list();
  }

  create(input: CreateTrainerInput) {
    return this.repo.create(input);
  }

  remove(id: string) {
    return this.repo.remove(id);
  }
}
