import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerController } from "./ledger.controller.js";
import { LedgerService } from "./ledger.service.js";
import { LEDGER_STORE, type LedgerStore } from "./ledger.types.js";
import { MemoryLedgerStore } from "./memory-ledger.store.js";
import { PostgresLedgerStore } from "./postgres-ledger.store.js";

const logger = createLogger("dang-api-ledger");

export function createLedgerStore(): LedgerStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory ledger store");
    return new MemoryLedgerStore();
  }

  try {
    logger.info("Using PostgreSQL ledger store");
    return PostgresLedgerStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL ledger; falling back to memory", {
      detail,
    });
    return new MemoryLedgerStore();
  }
}

@Global()
@Module({
  imports: [AuthModule],
  controllers: [LedgerController],
  providers: [
    LedgerService,
    {
      provide: LEDGER_STORE,
      useFactory: createLedgerStore,
    },
  ],
  exports: [LEDGER_STORE],
})
export class LedgerModule {}
