import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { IamModule } from "../iam/iam.module.js";
import { MemoryPartnershipStore } from "./memory-partnership.store.js";
import { PartnershipController } from "./partnership.controller.js";
import { PartnershipService } from "./partnership.service.js";
import { PARTNERSHIP_STORE, type PartnershipStore } from "./partnership.types.js";
import { PostgresPartnershipStore } from "./postgres-partnership.store.js";

const logger = createLogger("dang-api-partnership");

export function createPartnershipStore(): PartnershipStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory partnership store");
    return new MemoryPartnershipStore();
  }
  try {
    logger.info("Using PostgreSQL partnership store");
    return PostgresPartnershipStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL partnership store; falling back to memory", {
      detail,
    });
    return new MemoryPartnershipStore();
  }
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [PartnershipController],
  providers: [
    PartnershipService,
    { provide: PARTNERSHIP_STORE, useFactory: createPartnershipStore },
  ],
  exports: [PARTNERSHIP_STORE],
})
export class PartnershipModule {}
