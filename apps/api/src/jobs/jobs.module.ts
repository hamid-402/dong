import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";
import { JOB_RUN_STORE, type JobRunStore } from "./job-run.types.js";
import { MemoryJobRunStore } from "./memory-job-run.store.js";
import { PostgresJobRunStore } from "./postgres-job-run.store.js";

const logger = createLogger("dang-api-jobs");

export function createJobRunStore(): JobRunStore {
  const env = loadAppEnv();
  return createPersistenceStore<JobRunStore>({
    name: "job run store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresJobRunStore.fromConnectionString(url),
    createMemory: () => new MemoryJobRunStore(),
  });
}

/**
 * Do not import RetentionModule here — that pulls Statements→Expenses→Attachments→Jobs
 * and TDZ-crashes the process. RetentionService is resolved via ModuleRef at runtime.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [
    { provide: JOB_RUN_STORE, useFactory: createJobRunStore },
    JobsService,
  ],
  exports: [JobsService, JOB_RUN_STORE],
})
export class JobsModule {}
