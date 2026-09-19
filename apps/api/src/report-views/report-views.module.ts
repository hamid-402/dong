import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MemoryReportViewsStore } from "./memory-report-views.store.js";
import { PostgresReportViewsStore } from "./postgres-report-views.store.js";
import { ReportViewsController } from "./report-views.controller.js";
import { REPORT_VIEWS_STORE, type ReportViewsStore } from "./report-views.types.js";

const logger = createLogger("dang-api-report-views");

function buildStore(): ReportViewsStore {
  const env = loadAppEnv();
  return createPersistenceStore<ReportViewsStore>({
    name: "report views store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresReportViewsStore.fromConnectionString(url),
    createMemory: () => new MemoryReportViewsStore(),
  });
}

@Module({
  imports: [AuthModule],
  controllers: [ReportViewsController],
  providers: [{ provide: REPORT_VIEWS_STORE, useFactory: buildStore }],
  exports: [REPORT_VIEWS_STORE],
})
export class ReportViewsModule {}
