import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { MemorySettlementStore } from "./memory-settlement.store.js";
import { PostgresSettlementStore } from "./postgres-settlement.store.js";
import { SETTLEMENT_STORE, type SettlementStore } from "./settlement.types.js";
import { SettlementsController } from "./settlements.controller.js";
import { SettlementsService } from "./settlements.service.js";

const logger = createLogger("dang-api-settlements");

export function createSettlementStore(): SettlementStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory settlement store");
    return new MemorySettlementStore();
  }

  try {
    logger.info("Using PostgreSQL settlement store");
    return PostgresSettlementStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error(
      "Failed to initialize PostgreSQL settlement store; falling back to memory",
      { detail },
    );
    return new MemorySettlementStore();
  }
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
