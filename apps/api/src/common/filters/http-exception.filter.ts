import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ProblemBody {
  status: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
  requestId?: string;
  details?: unknown;
}

/**
 * Global filter that serialises any thrown error into a consistent JSON shape
 * (RFC 7807-ish).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "internal_error";
    let message = "unexpected server error";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        code = this.codeFromStatus(status);
      } else if (body && typeof body === "object") {
        const obj = body as Record<string, unknown>;
        code = String(obj.error ?? this.codeFromStatus(status));
        message = String(
          Array.isArray(obj.message) ? obj.message.join("; ") : obj.message ?? code,
        );
        details = obj.details ?? undefined;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack ?? exception.message);
      message = exception.message;
    } else {
      this.logger.error(`non-error thrown: ${JSON.stringify(exception)}`);
    }

    const body: ProblemBody = {
      status,
      code,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
      requestId: req.id,
      details,
    };
    res.status(status).json(body);
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case 400: return "bad_request";
      case 401: return "unauthorized";
      case 403: return "forbidden";
      case 404: return "not_found";
      case 409: return "conflict";
      case 422: return "unprocessable";
      default:  return status >= 500 ? "server_error" : "error";
    }
  }
}
