import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MemoryProcurementStore } from "./procurement.store.js";
import { ProcurementController } from "./procurement.controller.js";
import { ProcurementService } from "./procurement.service.js";
import { PROCUREMENT_STORE, type ProcurementStore } from "./procurement.types.js";
import { PostgresProcurementStore } from "./postgres-procurement.store.js";

const logger = createLogger("dang-api-procurement");

export function createProcurementStore(): ProcurementStore {
  const env = loadAppEnv();
  return createPersistenceStore<ProcurementStore>({
    name: "procurement store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresProcurementStore.fromConnectionString(url),
    createMemory: () => new MemoryProcurementStore(),
  });
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
