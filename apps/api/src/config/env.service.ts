import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EnvSchema, type Env, loadEnv } from "./env.schema";

/**
 * Typed accessor over the validated environment. Prefer injecting `EnvService`
 * and calling `env.get("KEY")` over the raw `ConfigService` — this way the
 * rest of the app never needs to know about @nestjs/config internals, and
 * returned values are strictly typed against `Env`.
 */
@Injectable()
export class EnvService {
  private readonly env: Env;

  constructor(config: ConfigService) {
    const pick = Object.keys(EnvSchema.shape) as (keyof Env)[];
    const raw = Object.fromEntries(pick.map((k) => [k, config.get(k)]));
    this.env = loadEnv(raw as NodeJS.ProcessEnv);
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  all(): Env {
    return this.env;
  }
}
