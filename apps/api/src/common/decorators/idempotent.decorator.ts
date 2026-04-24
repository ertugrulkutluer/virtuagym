import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "isIdempotent";

/**
 * Marks a handler as requiring the `Idempotency-Key` header. The
 * IdempotencyInterceptor short-circuits repeats with the cached response.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
