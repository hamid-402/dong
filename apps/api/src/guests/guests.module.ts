import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import {
  GUEST_PLACEHOLDER_STORE,
  MemoryGuestPlaceholderStore,
  type GuestPlaceholderStore,
} from "./guest-placeholder.store.js";
import { GuestsController } from "./guests.controller.js";
import { GuestsService } from "./guests.service.js";
import { PostgresGuestPlaceholderStore } from "./postgres-guest-placeholder.store.js";

const logger = createLogger("dang-api-guests");

function buildStore(): GuestPlaceholderStore {
  const env = loadAppEnv();
  return createPersistenceStore<GuestPlaceholderStore>({
    name: "guest placeholder store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresGuestPlaceholderStore.fromConnectionString(url),
    createMemory: () => new MemoryGuestPlaceholderStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule, ExpensesModule, LedgerModule, AuditModule],
  controllers: [GuestsController],
  providers: [
    GuestsService,
    { provide: GUEST_PLACEHOLDER_STORE, useFactory: buildStore },
  ],
  exports: [GuestsService, GUEST_PLACEHOLDER_STORE],
})
export class GuestsModule {}
