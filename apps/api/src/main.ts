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
  /** Allow same-LAN browser origins (http://192.168.x.x:3005) in development. */
  const isPrivateLanHttpOrigin = (origin: string): boolean => {
    try {
      const url = new URL(origin);
      if (url.protocol !== "http:") return false;
      const port = url.port || "80";
      if (port !== "3005") return false;
      const host = url.hostname;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
      const m = /^172\.(\d{1,3})\./.exec(host);
      if (m) {
        const second = Number(m[1]);
        return second >= 16 && second <= 31;
      }
      return false;
    } catch {
      return false;
    }
  };
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = new Set([
        env.webOrigin,
        "http://127.0.0.1:3005",
        "http://localhost:3005",
        ...lanOrigins,
      ]);
      if (allowed.has(origin) || isPrivateLanHttpOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

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
