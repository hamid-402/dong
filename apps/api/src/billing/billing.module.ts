import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { BillingController } from "./billing.controller.js";
import { BillingMaintenanceService } from "./billing-maintenance.service.js";
import { BillingService } from "./billing.service.js";
import { InvoiceEventsService } from "./invoice-events.service.js";
import { BILLING_STORE, type BillingStore } from "./billing.types.js";
import { MemoryBillingStore } from "./memory-billing.store.js";
import { PostgresBillingStore } from "./postgres-billing.store.js";

const logger = createLogger("dang-api-billing");

function buildBillingStore(expenses: ExpenseStore): BillingStore {
  const env = loadAppEnv();
  return createPersistenceStore<BillingStore>({
    name: "billing store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresBillingStore.fromConnectionString(url),
    createMemory: () => new MemoryBillingStore(expenses),
  });
}

/**
 * Global so ExpensesService can reach BILLING_STORE for live invoice
 * projection without importing BillingModule (which would form a cycle,
 * since billing's memory store reads the expense store).
 */
@Global()
@Module({
  imports: [AuthModule, ExpensesModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingMaintenanceService,
    InvoiceEventsService,
    {
      provide: BILLING_STORE,
      inject: [EXPENSE_STORE],
      useFactory: (expenses: ExpenseStore) => buildBillingStore(expenses),
    },
  ],
  exports: [BILLING_STORE, BillingMaintenanceService, InvoiceEventsService],
})
export class BillingModule {}
