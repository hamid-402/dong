import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { ExpensePolicyController } from "./expense-policy.controller.js";
import { ExpensePolicyService } from "./expense-policy.service.js";
import {
  EXPENSE_POLICY_STORE,
  type ExpensePolicyStore,
} from "./expense-policy.types.js";
import { MemoryExpensePolicyStore } from "./memory-expense-policy.store.js";
import { PostgresExpensePolicyStore } from "./postgres-expense-policy.store.js";

const logger = createLogger("dang-api-expense-policy");

function createExpensePolicyStore(): ExpensePolicyStore {
  const env = loadAppEnv();
  return createPersistenceStore<ExpensePolicyStore>({
    name: "expense policy store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) =>
      PostgresExpensePolicyStore.fromConnectionString(url),
    createMemory: () => new MemoryExpensePolicyStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [ExpensePolicyController],
  providers: [
    ExpensePolicyService,
    { provide: EXPENSE_POLICY_STORE, useFactory: createExpensePolicyStore },
  ],
  exports: [EXPENSE_POLICY_STORE],
})
export class ExpensePolicyModule {}
