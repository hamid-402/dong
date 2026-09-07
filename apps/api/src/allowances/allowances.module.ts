import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { AllowancesController } from "./allowances.controller.js";
import { AllowancesService } from "./allowances.service.js";
import { ALLOWANCE_STORE, type AllowanceStore } from "./allowances.types.js";
import { MemoryAllowanceStore } from "./memory-allowance.store.js";
import { PostgresAllowanceStore } from "./postgres-allowance.store.js";

const logger = createLogger("dang-api-allowances");

function createAllowanceStore(): AllowanceStore {
  const env = loadAppEnv();
  return createPersistenceStore<AllowanceStore>({
    name: "allowance store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresAllowanceStore.fromConnectionString(url),
    createMemory: () => new MemoryAllowanceStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule, ExpensesModule],
  controllers: [AllowancesController],
  providers: [
    AllowancesService,
    { provide: ALLOWANCE_STORE, useFactory: createAllowanceStore },
  ],
  exports: [ALLOWANCE_STORE],
})
export class AllowancesModule {}
