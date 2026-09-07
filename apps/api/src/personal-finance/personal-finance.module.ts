import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { SettlementsModule } from "../settlements/settlements.module.js";
import { MemoryPersonalResourcesStore } from "./memory-personal-resources.store.js";
import { PersonalFinanceController } from "./personal-finance.controller.js";
import { PostgresPersonalResourcesStore } from "./postgres-personal-resources.store.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "./personal-resources.types.js";

const logger = createLogger("dang-api-personal-finance");

export function createPersonalResourcesStore(): PersonalResourcesStore {
  const env = loadAppEnv();
  return createPersistenceStore<PersonalResourcesStore>({
    name: "personal resources store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPersonalResourcesStore.fromConnectionString(url),
    createMemory: () => new MemoryPersonalResourcesStore(),
  });
}

@Module({
  imports: [AuthModule, ExpensesModule, SettlementsModule],
  controllers: [PersonalFinanceController],
  providers: [
    { provide: PERSONAL_RESOURCES_STORE, useFactory: createPersonalResourcesStore },
  ],
  exports: [PERSONAL_RESOURCES_STORE],
})
export class PersonalFinanceModule {}
