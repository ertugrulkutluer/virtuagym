import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Runs once before the e2e suite starts. Loads .env.test, applies Prisma
 * migrations against the test database, and leaves the schema ready for the
 * test runner. Containers are expected to already be up — see the
 * `pretest:e2e` script.
 */
export default async function globalSetup() {
  const envFile = resolve(__dirname, ".env.test");
  const raw = readFileSync(envFile, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }

  execSync("pnpm prisma migrate deploy", {
    cwd: resolve(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });
}
