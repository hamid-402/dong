import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
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
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory personal resources store");
    return new MemoryPersonalResourcesStore();
  }
  try {
    logger.info("Using PostgreSQL personal resources store");
    return PostgresPersonalResourcesStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error(
      "Failed to initialize PostgreSQL personal resources; falling back to memory",
      { detail },
    );
    return new MemoryPersonalResourcesStore();
  }
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
