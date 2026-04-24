import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const HEADER = "x-request-id";

/**
 * Attach a request id so every log line and error response can reference it.
 * Honours an incoming `x-request-id` header if present (useful when sitting
 * behind a reverse proxy that already tags requests).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const id = (req.headers[HEADER] as string | undefined) ?? randomUUID();
    req.id = id;
    res.setHeader(HEADER, id);

    const started = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - started;
      this.logger.log(`[${id}] ${req.method} ${req.originalUrl} → ${res.statusCode} ${ms}ms`);
    });
    next();
  }
}
