import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { WaveFSettingsModule } from "../wave-f-settings/wave-f-settings.module.js";
import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsService } from "./analytics.service.js";
import {
  ANALYTICS_STORE,
  MemoryAnalyticsStore,
  type AnalyticsStore,
} from "./analytics.store.js";
import { PostgresAnalyticsStore } from "./postgres-analytics.store.js";

const logger = createLogger("dang-api-analytics-store");

function buildAnalyticsStore(): AnalyticsStore {
  const env = loadAppEnv();
  const replicaUrl = process.env.ANALYTICS_DATABASE_URL?.trim();
  const url = replicaUrl || env.databaseUrl;
  const replicaConfigured = Boolean(replicaUrl);
  return createPersistenceStore<AnalyticsStore>({
    name: "analytics warehouse store",
    databaseUrl: url,
    logger,
    createPostgres: (connectionUrl) =>
      PostgresAnalyticsStore.fromConnectionString(
        connectionUrl,
        replicaConfigured,
      ),
    createMemory: () => new MemoryAnalyticsStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule, ExpensesModule, WaveFSettingsModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    { provide: ANALYTICS_STORE, useFactory: buildAnalyticsStore },
  ],
  exports: [AnalyticsService, ANALYTICS_STORE],
})
export class AnalyticsModule {}
