import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { AuditController } from "./audit.controller.js";
import { ProductMetricsController } from "./product-metrics.controller.js";
import { AUDIT_STORE, type AuditStore } from "./audit.types.js";
import { MemoryAuditStore } from "./memory-audit.store.js";
import { PostgresAuditStore } from "./postgres-audit.store.js";

const logger = createLogger("dang-api-audit");

export function createAuditStore(): AuditStore {
  const env = loadAppEnv();
  return createPersistenceStore<AuditStore>({
    name: "audit store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresAuditStore.fromConnectionString(url),
    createMemory: () => new MemoryAuditStore(),
  });
}

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController, ProductMetricsController],
  providers: [
    {
      provide: AUDIT_STORE,
      useFactory: createAuditStore,
    },
  ],
  exports: [AUDIT_STORE],
})
export class AuditModule {}
