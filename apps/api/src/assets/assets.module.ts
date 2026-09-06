import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { ASSETS_STORE, MemoryAssetsStore, type AssetsStore } from "./assets.store.js";
import { PostgresAssetsStore } from "./postgres-assets.store.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

const logger = createLogger("dang-api-assets");

export function createAssetsStore(): AssetsStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory assets store");
    return new MemoryAssetsStore();
  }
  try {
    logger.info("Using PostgreSQL assets store");
    return PostgresAssetsStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL assets store; falling back to memory", {
      detail,
    });
    return new MemoryAssetsStore();
  }
}

@Module({
  imports: [AuthModule, ProcurementModule],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    { provide: ASSETS_STORE, useFactory: createAssetsStore },
  ],
  exports: [ASSETS_STORE],
})
export class AssetsModule {}
