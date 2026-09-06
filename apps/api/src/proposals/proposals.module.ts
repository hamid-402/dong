import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
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
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory proposal store");
    return new MemoryProposalStore();
  }
  try {
    logger.info("Using PostgreSQL proposal store");
    return PostgresProposalStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL proposal store; falling back to memory", {
      detail,
    });
    return new MemoryProposalStore();
  }
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
