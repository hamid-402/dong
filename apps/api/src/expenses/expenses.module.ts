import { Module, forwardRef } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { ApprovalStepsModule } from "../approval-steps/approval-steps.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { ExpensePolicyModule } from "../expense-policy/expense-policy.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { MakerCheckerModule } from "../maker-checker/maker-checker.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { SubunitsModule } from "../subunits/subunits.module.js";
import { FxRatesModule } from "../fx-rates/fx-rates.module.js";
import { DailyLedgerController } from "./daily-ledger.controller.js";
import { LedgerDayController } from "./ledger-day.controller.js";
import { DailyLedgerService } from "./daily-ledger.service.js";
import { EXPENSE_STORE, type ExpenseStore } from "./expense.types.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesService } from "./expenses.service.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { PostgresExpenseStore } from "./postgres-expense.store.js";
import { ExpenseTagsController } from "./expense-tags.controller.js";
import { ExpenseTagsService } from "./expense-tags.service.js";
import {
  EXPENSE_TAGS_STORE,
  MemoryExpenseTagsStore,
  type ExpenseTagsStore,
} from "./expense-tags.store.js";
import { PostgresExpenseTagsStore } from "./postgres-expense-tags.store.js";
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
  return createPersistenceStore<ExpenseStore>({
    name: "expense store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresExpenseStore.fromConnectionString(url),
    createMemory: () => new MemoryExpenseStore(),
  });
}

function createExpenseTagsStore(): ExpenseTagsStore {
  const env = loadAppEnv();
  return createPersistenceStore<ExpenseTagsStore>({
    name: "expense tags store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresExpenseTagsStore.fromConnectionString(url),
    createMemory: () => new MemoryExpenseTagsStore(),
  });
}

function createWorkspaceDayStore(): WorkspaceDayStore {
  const env = loadAppEnv();
  return createPersistenceStore<WorkspaceDayStore>({
    name: "workspace day store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresWorkspaceDayStore.fromConnectionString(url),
    createMemory: () => new MemoryWorkspaceDayStore(),
  });
}

function createWorkspaceRangeLockStore(): WorkspaceRangeLockStore {
  const env = loadAppEnv();
  return createPersistenceStore<WorkspaceRangeLockStore>({
    name: "range lock store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) =>
      PostgresWorkspaceRangeLockStore.fromConnectionString(url),
    createMemory: () => new MemoryWorkspaceRangeLockStore(),
  });
}

@Module({
  imports: [
    AuthModule,
    LedgerModule,
    IamModule,
    forwardRef(() => ProcurementModule),
    ExpensePolicyModule,
    ApprovalStepsModule,
    MakerCheckerModule,
    CatalogModule,
    SubunitsModule,
    FxRatesModule,
  ],
  controllers: [
    ExpensesController,
    ExpenseTagsController,
    OutingsController,
    MemberSharesController,
    DailyLedgerController,
    LedgerDayController,
  ],
  providers: [
    ExpensesService,
    ExpenseTagsService,
    DailyLedgerService,
    {
      provide: EXPENSE_STORE,
      useFactory: createExpenseStore,
    },
    {
      provide: EXPENSE_TAGS_STORE,
      useFactory: createExpenseTagsStore,
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
  exports: [
    ExpensesService,
    ExpenseTagsService,
    EXPENSE_STORE,
    EXPENSE_TAGS_STORE,
    OUTING_STORE,
    WORKSPACE_DAY_STORE,
    WORKSPACE_RANGE_LOCK_STORE,
  ],
})
export class ExpensesModule {}
