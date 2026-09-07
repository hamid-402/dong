import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { MemoryReimbursementStore } from "./memory-reimbursement.store.js";
import { PostgresReimbursementStore } from "./postgres-reimbursement.store.js";
import { ReimbursementsController } from "./reimbursements.controller.js";
import { ReimbursementsService } from "./reimbursements.service.js";
import { REIMBURSEMENT_STORE, type ReimbursementStore } from "./reimbursements.types.js";

const logger = createLogger("dang-api-reimbursements");
@Module({
  imports: [AuthModule, IamModule, ExpensesModule],
  controllers: [ReimbursementsController],
  providers: [ReimbursementsService, { provide: REIMBURSEMENT_STORE, useFactory: (): ReimbursementStore => {
    const env = loadAppEnv();
    return createPersistenceStore<ReimbursementStore>({ name: "reimbursement store", databaseUrl: env.databaseUrl, logger,
      createPostgres: (url) => PostgresReimbursementStore.fromConnectionString(url),
      createMemory: () => new MemoryReimbursementStore() });
  }}],
  exports: [REIMBURSEMENT_STORE],
})
export class ReimbursementsModule {}
