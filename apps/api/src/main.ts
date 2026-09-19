import "reflect-metadata";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { loadAppEnv, loadEnvFile } from "@dang/config";
import { resolveTracingMode, startOtlpSpanExporter } from "@dang/observability";
import { createLogger } from "@dang/observability";
import { AppModule } from "./app.module.js";
import { allowCorsOrigin } from "./common/cors-origin.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";

async function bootstrap() {
  const loadedEnv = loadEnvFile();
  const env = loadAppEnv();
  const logger = createLogger("dang-api");
  const otel = startOtlpSpanExporter();
  logger.info("Tracing mode", {
    mode: otel.mode,
    resolved: resolveTracingMode(),
    otlpActive: otel.active ? 1 : 0,
  });
  if (loadedEnv) {
    logger.info("Loaded local .env file");
  }
  if (env.nodeEnv === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production");
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      bodyLimit: 12 * 1024 * 1024,
    }),
  );

  await app.register(helmet);
  await app.register(cookie, {
    secret: env.sessionSecret,
  });
  app.useGlobalFilters(new ProblemDetailsFilter());
  const lanOrigins = (process.env.WEB_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      callback(
        null,
        allowCorsOrigin({
          origin,
          webOrigin: env.webOrigin,
          extraOrigins: lanOrigins,
          nodeEnv: env.nodeEnv,
        }),
      );
    },
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  const nestClose = app.close.bind(app);
  app.close = (async () => {
    try {
      await otel.stop();
    } catch (err: unknown) {
      logger.warn("OTLP shutdown flush failed", {
        detail: err instanceof Error ? err.message : "unknown",
      });
    }
    return nestClose();
  });
  process.once("beforeExit", () => {
    void otel.stop().catch(() => undefined);
  });

  const swaggerEnabled =
    env.nodeEnv !== "production" || process.env.DANG_SWAGGER === "1";
  if (swaggerEnabled) {
    const openApiConfig = new DocumentBuilder()
      .setTitle("Dang Hamkari API")
      .setDescription("Contract for the Dang Hamkari operational ledger")
      .setVersion("0.1.0")
      .build();
    const document = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

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
