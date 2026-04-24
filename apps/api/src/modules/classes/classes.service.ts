import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateClassInput,
  ListClassesQuery,
  UpdateClassInput,
} from "@gymflow/shared";
import { ClassesRepository } from "./classes.repository";

@Injectable()
export class ClassesService {
  constructor(private readonly repo: ClassesRepository) {}

  create(input: CreateClassInput) {
    return this.repo.create(input);
  }

  async list(query: ListClassesQuery) {
    const [items, total] = await this.repo.list(query);
    return { items, total, take: query.take ?? 50, skip: query.skip ?? 0 };
  }

  async get(id: string) {
    const klass = await this.repo.findById(id);
    if (!klass) throw new NotFoundException("class not found");
    return klass;
  }

  async update(id: string, input: UpdateClassInput) {
    await this.get(id);
    return this.repo.update(id, input);
  }

  async remove(id: string) {
    await this.get(id);
    await this.repo.softCancel(id);
    return { id, cancelled: true };
  }
}
