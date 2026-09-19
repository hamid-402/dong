import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { SecurityEventsModule } from "../security-events/security-events.module.js";
import { EncryptedPayoutInstructionsStore } from "./encrypted-payout-instructions.store.js";
import { MemoryPayoutInstructionsStore } from "./memory-payout-instructions.store.js";
import { MemoryStatementsExportStore } from "./memory-statements-export.store.js";
import { PayoutInstructionsController } from "./payout-instructions.controller.js";
import {
  PAYOUT_INSTRUCTIONS_STORE,
  type PayoutInstructionsStore,
} from "./payout-instructions.types.js";
import { PostgresPayoutInstructionsStore } from "./postgres-payout-instructions.store.js";
import { PostgresStatementsExportStore } from "./postgres-statements-export.store.js";
import { StatementsController } from "./statements.controller.js";
import { StatementsService } from "./statements.service.js";
import {
  STATEMENTS_EXPORT_STORE,
  type StatementsExportStore,
} from "./statements.types.js";

const logger = createLogger("dang-api-statements");

function buildExportStore(): StatementsExportStore {
  const env = loadAppEnv();
  return createPersistenceStore<StatementsExportStore>({
    name: "statements export store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresStatementsExportStore.fromConnectionString(url),
    createMemory: () => new MemoryStatementsExportStore(),
  });
}

function buildPayoutStore(): PayoutInstructionsStore {
  const env = loadAppEnv();
  const inner = createPersistenceStore<PayoutInstructionsStore>({
    name: "payout instructions store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPayoutInstructionsStore.fromConnectionString(url),
    createMemory: () => new MemoryPayoutInstructionsStore(),
  });
  return new EncryptedPayoutInstructionsStore(inner);
}

@Module({
  imports: [
    AuthModule,
    AuditModule,
    SecurityEventsModule,
    IamModule,
    ExpensesModule,
    NotificationsModule,
  ],
  controllers: [StatementsController, PayoutInstructionsController],
  providers: [
    StatementsService,
    { provide: STATEMENTS_EXPORT_STORE, useFactory: buildExportStore },
    { provide: PAYOUT_INSTRUCTIONS_STORE, useFactory: buildPayoutStore },
  ],
  exports: [StatementsService, STATEMENTS_EXPORT_STORE, PAYOUT_INSTRUCTIONS_STORE],
})
export class StatementsModule {}
