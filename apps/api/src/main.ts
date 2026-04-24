import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { EnvService } from "./config/env.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix("api");

  // Validation is Zod-driven per-endpoint via @ZodBody / @ZodQuery — no global
  // class-validator pipe is needed.

  const swagger = new DocumentBuilder()
    .setTitle("Gymflow API")
    .setDescription("Mini gym class booking SaaS with AI-assisted overbooking")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  const env = app.get(EnvService);
  const port = env.get("API_PORT");
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[gymflow-api] listening on http://localhost:${port}`);
}

bootstrap();
