import { INestApplication } from "@nestjs/common";
import { Test, TestingModuleBuilder } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/core/prisma/prisma.service";
import { NoShowAdvisor } from "../../src/modules/overbooking/no-show-advisor.service";

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  advisor: { allow: boolean; reason: string };
  close: () => Promise<void>;
}

/**
 * Boots the real Nest app with the real Postgres + Redis from compose.
 * Only `NoShowAdvisor` is overridden so booking tests don't hit Grok and
 * so each test can flip the overbook decision deterministically.
 */
export async function buildTestApp(): Promise<TestContext> {
  const advisor = { allow: false, reason: "test_default" };

  const builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(NoShowAdvisor)
    .useValue({
      shouldAllowOverbook: jest.fn(async () => ({
        allow: advisor.allow,
        reason: advisor.reason,
      })),
      setEnabled: jest.fn(),
      setOverbookFactor: jest.fn(),
      getOverbookFactor: jest.fn(() => 0.9),
      isEnabled: jest.fn(() => false),
    });

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    advisor,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
    },
  };
}
