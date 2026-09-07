import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { MemorySettlementStore } from "./memory-settlement.store.js";
import { PostgresSettlementStore } from "./postgres-settlement.store.js";
import { SETTLEMENT_STORE, type SettlementStore } from "./settlement.types.js";
import { SettlementsController } from "./settlements.controller.js";
import { SettlementsService } from "./settlements.service.js";

const logger = createLogger("dang-api-settlements");

export function createSettlementStore(): SettlementStore {
  const env = loadAppEnv();
  return createPersistenceStore<SettlementStore>({
    name: "settlement store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresSettlementStore.fromConnectionString(url),
    createMemory: () => new MemorySettlementStore(),
  });
}

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [SettlementsController],
  providers: [
    SettlementsService,
    {
      provide: SETTLEMENT_STORE,
      useFactory: createSettlementStore,
    },
  ],
  exports: [SETTLEMENT_STORE],
})
export class SettlementsModule {}
