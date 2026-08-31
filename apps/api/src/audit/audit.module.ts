import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { AuditController } from "./audit.controller.js";
import { AUDIT_STORE, type AuditStore } from "./audit.types.js";
import { MemoryAuditStore } from "./memory-audit.store.js";
import { PostgresAuditStore } from "./postgres-audit.store.js";

const logger = createLogger("dang-api-audit");

export function createAuditStore(): AuditStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory audit store");
    return new MemoryAuditStore();
  }

  try {
    logger.info("Using PostgreSQL audit store");
    return PostgresAuditStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL audit store; falling back to memory", {
      detail,
    });
    return new MemoryAuditStore();
  }
}

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_STORE,
      useFactory: createAuditStore,
    },
  ],
  exports: [AUDIT_STORE],
})
export class AuditModule {}
