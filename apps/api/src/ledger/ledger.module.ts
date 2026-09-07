import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { LedgerController } from "./ledger.controller.js";
import { LedgerService } from "./ledger.service.js";
import { LEDGER_STORE, type LedgerStore } from "./ledger.types.js";
import { MemoryLedgerStore } from "./memory-ledger.store.js";
import { PostgresLedgerStore } from "./postgres-ledger.store.js";

const logger = createLogger("dang-api-ledger");

export function createLedgerStore(): LedgerStore {
  const env = loadAppEnv();
  return createPersistenceStore<LedgerStore>({
    name: "ledger store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresLedgerStore.fromConnectionString(url),
    createMemory: () => new MemoryLedgerStore(),
  });
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
