import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";
import { EnvService } from "../../config/env.service";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit() {
    try {
      await this.client.ping();
    } catch (err) {
      this.logger.error(`redis unreachable: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  raw(): Redis {
    return this.client;
  }

  // ── Typed JSON helpers ──────────────────────────────────────

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`redis: corrupt JSON at ${key}, purging`);
      await this.client.del(key);
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }
}

export function buildRedisFactory(env: EnvService): Redis {
  return new Redis(env.get("REDIS_URL"), {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableReadyCheck: true,
  });
}
