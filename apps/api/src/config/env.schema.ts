import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AI_ADVICE_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(30),
  BOOKING_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(60),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  GROK_API_KEY: z.string().min(10),
  GROK_API_URL: z.string().url().default("https://api.x.ai/v1"),
  GROK_MODEL: z.string().default("grok-2-latest"),

  AI_ENABLED_DEFAULT: z.coerce.boolean().default(true),
  AI_OVERBOOK_FACTOR: z.coerce.number().min(0.5).max(1.2).default(0.9),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`invalid environment:\n${msg}`);
  }
  return parsed.data;
}
