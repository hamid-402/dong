import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { MemoryWorkspaceSubunitStore } from "./memory-subunit.store.js";
import { PostgresWorkspaceSubunitStore } from "./postgres-subunit.store.js";
import {
  WORKSPACE_SUBUNIT_STORE,
  type WorkspaceSubunitStore,
} from "./subunit.types.js";
import { SubunitsController } from "./subunits.controller.js";
import { SubunitsService } from "./subunits.service.js";

const logger = createLogger("dang-api-subunits");

export function createSubunitStore(): WorkspaceSubunitStore {
  const env = loadAppEnv();
  return createPersistenceStore<WorkspaceSubunitStore>({
    name: "workspace subunit store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresWorkspaceSubunitStore.fromConnectionString(url),
    createMemory: () => new MemoryWorkspaceSubunitStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [SubunitsController],
  providers: [
    SubunitsService,
    {
      provide: WORKSPACE_SUBUNIT_STORE,
      useFactory: createSubunitStore,
    },
  ],
  exports: [WORKSPACE_SUBUNIT_STORE, SubunitsService],
})
export class SubunitsModule {}
