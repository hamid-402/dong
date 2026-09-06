import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadEnvFile, isRedisConfigured, loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { getWorkerStatus } from "./jobs/catalog.js";
import { runConsumerLoop } from "./jobs/consumer.js";
import { WorkerModule } from "./worker.module.js";

loadEnvFile();

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();

  const logger = createLogger("dang-worker");
  const env = loadAppEnv();
  const status = getWorkerStatus();
  const redisOk = isRedisConfigured(env);

  logger.info("Worker bootstrap", {
    jobCount: status.jobs.length,
    redisConfigured: redisOk ? 1 : 0,
    queueAdapter: redisOk ? "redis" : "none",
  });
  for (const job of status.jobs) {
    logger.info("Registered job definition", {
      name: job.name,
      phase: job.phase,
      requiresRedis: job.requiresRedis ? 1 : 0,
    });
  }

  const signal = { stopped: false, inFlight: false };
  const onStop = () => {
    signal.stopped = true;
    logger.info("Shutdown signal received — finishing in-flight job if any");
  };
  process.once("SIGINT", onStop);
  process.once("SIGTERM", onStop);

  if (redisOk) {
    await runConsumerLoop(signal);
  } else {
    logger.warn("REDIS_URL missing — consumer idle (inline jobs stay on API)");
    while (!signal.stopped) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  await app.close();
}

void bootstrap().catch((error: unknown) => {
  const logger = createLogger("dang-worker");
  const detail = error instanceof Error ? error.message : "unknown";
  logger.error("Worker bootstrap failed", { detail });
  throw error;
});
