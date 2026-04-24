import { Query } from "@nestjs/common";
import { ZodSchema } from "zod";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";

export const ZodQuery = (schema: ZodSchema) => Query(new ZodValidationPipe(schema));
