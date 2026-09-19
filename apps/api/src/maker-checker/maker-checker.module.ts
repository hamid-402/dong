import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MakerCheckerService } from "./maker-checker.service.js";
import {
  APPROVAL_DECISION_STORE,
  type ApprovalDecisionStore,
} from "./approval-decision.types.js";
import { MemoryApprovalDecisionStore } from "./memory-approval-decision.store.js";
import { PostgresApprovalDecisionStore } from "./postgres-approval-decision.store.js";

const logger = createLogger("dang-api-approval-decision-store");

export function createApprovalDecisionStore(): ApprovalDecisionStore {
  const env = loadAppEnv();
  return createPersistenceStore<ApprovalDecisionStore>({
    name: "approval decision store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) =>
      PostgresApprovalDecisionStore.fromConnectionString(url),
    createMemory: () => new MemoryApprovalDecisionStore(),
  });
}

@Module({
  providers: [
    {
      provide: APPROVAL_DECISION_STORE,
      useFactory: createApprovalDecisionStore,
    },
    MakerCheckerService,
  ],
  exports: [MakerCheckerService, APPROVAL_DECISION_STORE],
})
export class MakerCheckerModule {}
