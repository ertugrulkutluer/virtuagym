import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { Observable, from, lastValueFrom } from "rxjs";
import { IDEMPOTENT_KEY } from "../decorators/idempotent.decorator";
import { RedisService } from "../../core/redis/redis.service";

interface StoredResult {
  status: number;
  body: unknown;
}

const LOCK_TTL_SECONDS = 30;
const RESULT_TTL_SECONDS = 600;
const MIN_KEY_LEN = 8;
const MAX_KEY_LEN = 200;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const required = this.reflector.get<boolean>(
      IDEMPOTENT_KEY,
      ctx.getHandler(),
    );
    if (!required) return next.handle();

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: { id?: string } }>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const rawKey =
      (req.header("idempotency-key") as string | undefined) ??
      (req.header("Idempotency-Key") as string | undefined);

    if (!rawKey) {
      throw new BadRequestException({
        error: "idempotency_key_required",
        message: "Idempotency-Key header is required for this endpoint",
      });
    }
    if (rawKey.length < MIN_KEY_LEN || rawKey.length > MAX_KEY_LEN) {
      throw new BadRequestException({
        error: "invalid_idempotency_key",
        message: `Idempotency-Key must be ${MIN_KEY_LEN}-${MAX_KEY_LEN} characters`,
      });
    }

    const userId = req.user?.id ?? "anon";
    const scope = `${req.method}:${req.route?.path ?? req.path}`;
    const base = `idem:${userId}:${scope}:${rawKey}`;
    const resultKey = `${base}:result`;
    const lockKey = `${base}:lock`;

    const cached = await this.redis.getJson<StoredResult>(resultKey);
    if (cached) {
      res.setHeader("Idempotent-Replay", "true");
      res.status(cached.status);
      return from(Promise.resolve(cached.body));
    }

    const client = this.redis.raw();
    const locked = await client.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (locked !== "OK") {
      throw new ConflictException({
        error: "idempotency_in_flight",
        message:
          "a request with this Idempotency-Key is already being processed",
      });
    }

    const exec = async () => {
      try {
        const body = await lastValueFrom(next.handle());
        const status = res.statusCode ?? 200;
        await this.redis.setJson<StoredResult>(
          resultKey,
          { status, body },
          RESULT_TTL_SECONDS,
        );
        await this.redis.del(lockKey);
        return body;
      } catch (err) {
        await this.redis.del(lockKey).catch(() => undefined);
        throw err;
      }
    };

    return from(exec());
  }
}
