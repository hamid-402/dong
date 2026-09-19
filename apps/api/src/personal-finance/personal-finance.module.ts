import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { SettlementsModule } from "../settlements/settlements.module.js";
import { MemoryPersonalGoalsStore } from "./memory-personal-goals.store.js";
import { MemoryPersonalResourcesStore } from "./memory-personal-resources.store.js";
import { PersonalController } from "./personal.controller.js";
import { PersonalFinanceController } from "./personal-finance.controller.js";
import { PersonalFinanceService } from "./personal-finance.service.js";
import { PostgresPersonalGoalsStore } from "./postgres-personal-goals.store.js";
import { PostgresPersonalResourcesStore } from "./postgres-personal-resources.store.js";
import {
  PERSONAL_GOALS_STORE,
  type PersonalGoalsStore,
} from "./personal-goals.types.js";
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

export function createPersonalGoalsStore(): PersonalGoalsStore {
  const env = loadAppEnv();
  return createPersistenceStore<PersonalGoalsStore>({
    name: "personal goals store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPersonalGoalsStore.fromConnectionString(url),
    createMemory: () => new MemoryPersonalGoalsStore(),
  });
}

@Module({
  imports: [AuthModule, ExpensesModule, SettlementsModule],
  controllers: [PersonalFinanceController, PersonalController],
  providers: [
    PersonalFinanceService,
    { provide: PERSONAL_RESOURCES_STORE, useFactory: createPersonalResourcesStore },
    { provide: PERSONAL_GOALS_STORE, useFactory: createPersonalGoalsStore },
  ],
  exports: [PERSONAL_RESOURCES_STORE, PERSONAL_GOALS_STORE],
})
export class PersonalFinanceModule {}
