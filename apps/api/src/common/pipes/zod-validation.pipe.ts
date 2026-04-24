import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodError, ZodSchema } from "zod";

/**
 * Turn a Zod schema into a NestJS pipe. Use with `@Body(new ZodValidationPipe(MySchema))`
 * or via the `@ZodBody(MySchema)` decorator helper for less noise.
 */
export class ZodValidationPipe<TSchema extends ZodSchema> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          error: "validation_failed",
          message: "request payload is invalid",
          details: err.errors.map((e) => ({
            path: e.path.join("."),
            code: e.code,
            message: e.message,
          })),
        });
      }
      throw err;
    }
  }
}
