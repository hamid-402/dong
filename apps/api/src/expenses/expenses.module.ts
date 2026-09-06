import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { IamModule } from "../iam/iam.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { DailyLedgerController } from "./daily-ledger.controller.js";
import { DailyLedgerService } from "./daily-ledger.service.js";
import { EXPENSE_STORE, type ExpenseStore } from "./expense.types.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesService } from "./expenses.service.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { PostgresExpenseStore } from "./postgres-expense.store.js";
import {
  MemberSharesController,
  OutingsController,
} from "./outings.controller.js";
import { createOutingStore, OUTING_STORE } from "./outing.store.js";
import { PostgresWorkspaceDayStore } from "./postgres-workspace-day.store.js";
import { PostgresWorkspaceRangeLockStore } from "./postgres-workspace-range-lock.store.js";
import {
  MemoryWorkspaceDayStore,
  WORKSPACE_DAY_STORE,
  type WorkspaceDayStore,
} from "./workspace-day.store.js";
import {
  MemoryWorkspaceRangeLockStore,
  WORKSPACE_RANGE_LOCK_STORE,
  type WorkspaceRangeLockStore,
} from "./workspace-range-lock.store.js";

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

function createWorkspaceDayStore(): WorkspaceDayStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory workspace day store");
    return new MemoryWorkspaceDayStore();
  }
  try {
    logger.info("Using PostgreSQL workspace day store");
    return PostgresWorkspaceDayStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error(
      "Failed to initialize PostgreSQL workspace day store; falling back to memory",
      { detail },
    );
    return new MemoryWorkspaceDayStore();
  }
}

function createWorkspaceRangeLockStore(): WorkspaceRangeLockStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory range lock store");
    return new MemoryWorkspaceRangeLockStore();
  }
  try {
    logger.info("Using PostgreSQL workspace range lock store");
    return PostgresWorkspaceRangeLockStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error(
      "Failed to initialize PostgreSQL range lock store; falling back to memory",
      { detail },
    );
    return new MemoryWorkspaceRangeLockStore();
  }
}

@Module({
  imports: [AuthModule, LedgerModule, IamModule, ProcurementModule],
  controllers: [
    ExpensesController,
    OutingsController,
    MemberSharesController,
    DailyLedgerController,
  ],
  providers: [
    ExpensesService,
    DailyLedgerService,
    {
      provide: EXPENSE_STORE,
      useFactory: createExpenseStore,
    },
    {
      provide: OUTING_STORE,
      useFactory: createOutingStore,
    },
    {
      provide: WORKSPACE_DAY_STORE,
      useFactory: createWorkspaceDayStore,
    },
    {
      provide: WORKSPACE_RANGE_LOCK_STORE,
      useFactory: createWorkspaceRangeLockStore,
    },
  ],
  exports: [EXPENSE_STORE, OUTING_STORE, WORKSPACE_DAY_STORE, WORKSPACE_RANGE_LOCK_STORE],
})
export class ExpensesModule {}
