import "reflect-metadata";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { loadAppEnv, loadEnvFile } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AppModule } from "./app.module.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";

async function bootstrap() {
  const loadedEnv = loadEnvFile();
  const env = loadAppEnv();
  const logger = createLogger("dang-api");
  if (loadedEnv) {
    logger.info("Loaded local .env file");
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      bodyLimit: 1_048_576,
    }),
  );

  await app.register(helmet);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({
    origin: [env.webOrigin, "http://127.0.0.1:3005"],
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle("Dang Hamkari API")
    .setDescription("Contract for the Dang Hamkari operational ledger")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(env.apiPort, "0.0.0.0");
  logger.info("API listening", {
    port: env.apiPort,
    webOrigin: env.webOrigin,
    allowDevAuth: env.allowDevAuth ? 1 : 0,
    oidcConfigured: env.oidcIssuerUrl && env.oidcClientId ? 1 : 0,
  });
}

void bootstrap().catch((error: unknown) => {
  const logger = createLogger("dang-api");
  const detail = error instanceof Error ? error.message : "unknown";
  logger.error("API bootstrap failed", { detail });
  throw error;
});
