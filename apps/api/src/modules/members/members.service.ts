import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateMemberInput,
  GrantCreditsInput,
  ListMembersQuery,
  UpdateMemberInput,
} from "@gymflow/shared";
import { MembersRepository } from "./members.repository";

@Injectable()
export class MembersService {
  constructor(private readonly repo: MembersRepository) {}

  async create(input: CreateMemberInput) {
    try {
      return await this.repo.create(input);
    } catch (err) {
      if (this.repo.isUniqueViolation(err)) {
        throw new ConflictException("member email already exists");
      }
      throw err;
    }
  }

  async list(query: ListMembersQuery) {
    const [items, total] = await this.repo.list(query);
    return {
      items,
      total,
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    };
  }

  async get(id: string) {
    const member = await this.repo.findById(id);
    if (!member) throw new NotFoundException("member not found");
    return member;
  }

  async getByUserId(userId: string) {
    const member = await this.repo.findByUserId(userId);
    if (!member) throw new NotFoundException("member profile not found");
    return member;
  }

  async update(id: string, input: UpdateMemberInput) {
    await this.get(id);
    return this.repo.update(id, input);
  }

  async remove(id: string) {
    await this.get(id);
    return this.repo.remove(id);
  }

  async grantCredits(id: string, input: GrantCreditsInput) {
    await this.get(id);
    return this.repo.grantCreditsTx(id, input);
  }
}
