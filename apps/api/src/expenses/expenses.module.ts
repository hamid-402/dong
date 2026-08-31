import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { EXPENSE_STORE, type ExpenseStore } from "./expense.types.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesService } from "./expenses.service.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { PostgresExpenseStore } from "./postgres-expense.store.js";

const logger = createLogger("dang-api-expenses");

export function createExpenseStore(): ExpenseStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory expense store");
    return new MemoryExpenseStore();
  }

  try {
    logger.info("Using PostgreSQL expense store");
    return PostgresExpenseStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL expense store; falling back to memory", {
      detail,
    });
    return new MemoryExpenseStore();
  }
}

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    {
      provide: EXPENSE_STORE,
      useFactory: createExpenseStore,
    },
  ],
  exports: [EXPENSE_STORE],
})
export class ExpensesModule {}
