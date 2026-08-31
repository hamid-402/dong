import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createLogger } from "@dang/observability";
import { getWorkerStatus } from "./jobs/catalog.js";
import { WorkerModule } from "./worker.module.js";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();

  const logger = createLogger("dang-worker");
  const status = getWorkerStatus();
  logger.info("Worker is ready; queue adapters idle until Redis is available", {
    jobCount: status.jobs.length,
    queueAdapter: status.queueAdapter,
  });
  for (const job of status.jobs) {
    logger.info("Registered job definition", {
      name: job.name,
      phase: job.phase,
      requiresRedis: job.requiresRedis ? 1 : 0,
    });
  }
}

void bootstrap().catch((error: unknown) => {
  const logger = createLogger("dang-worker");
  const detail = error instanceof Error ? error.message : "unknown";
  logger.error("Worker bootstrap failed", { detail });
  throw error;
});
