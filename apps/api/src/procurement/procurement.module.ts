import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { MemoryProcurementStore } from "./procurement.store.js";
import { ProcurementController } from "./procurement.controller.js";
import { ProcurementService } from "./procurement.service.js";
import { PROCUREMENT_STORE, type ProcurementStore } from "./procurement.types.js";
import { PostgresProcurementStore } from "./postgres-procurement.store.js";

const logger = createLogger("dang-api-procurement");

export function createProcurementStore(): ProcurementStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory procurement store");
    return new MemoryProcurementStore();
  }
  try {
    logger.info("Using PostgreSQL procurement store (Need/PR/Budget)");
    return PostgresProcurementStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL procurement store; falling back to memory", {
      detail,
    });
    return new MemoryProcurementStore();
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ProcurementController],
  providers: [
    ProcurementService,
    { provide: PROCUREMENT_STORE, useFactory: createProcurementStore },
  ],
  exports: [PROCUREMENT_STORE, ProcurementService],
})
export class ProcurementModule {}
