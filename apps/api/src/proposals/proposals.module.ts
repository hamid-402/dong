import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { MemoryProposalStore } from "./memory-proposal.store.js";
import { PostgresProposalStore } from "./postgres-proposal.store.js";
import { PROPOSAL_STORE, type ProposalStore } from "./proposal.types.js";
import { ProposalsController } from "./proposals.controller.js";
import { ProposalsService } from "./proposals.service.js";

const logger = createLogger("dang-api-proposals");

export function createProposalStore(): ProposalStore {
  const env = loadAppEnv();
  return createPersistenceStore<ProposalStore>({
    name: "proposal store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresProposalStore.fromConnectionString(url),
    createMemory: () => new MemoryProposalStore(),
  });
}

@Module({
  imports: [AuthModule, ProcurementModule, NotificationsModule],
  controllers: [ProposalsController],
  providers: [
    ProposalsService,
    { provide: PROPOSAL_STORE, useFactory: createProposalStore },
  ],
  exports: [PROPOSAL_STORE, ProposalsService],
})
export class ProposalsModule {}
