import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { MemoryPartnershipStore } from "./memory-partnership.store.js";
import { PartnershipController } from "./partnership.controller.js";
import { PartnershipService } from "./partnership.service.js";
import { PARTNERSHIP_STORE, type PartnershipStore } from "./partnership.types.js";
import { PostgresPartnershipStore } from "./postgres-partnership.store.js";

const logger = createLogger("dang-api-partnership");

export function createPartnershipStore(): PartnershipStore {
  const env = loadAppEnv();
  return createPersistenceStore<PartnershipStore>({
    name: "partnership store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPartnershipStore.fromConnectionString(url),
    createMemory: () => new MemoryPartnershipStore(),
  });
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
