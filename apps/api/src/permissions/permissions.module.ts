import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { MemoryPermissionsStore } from "./memory-permissions.store.js";
import { PermissionsController } from "./permissions.controller.js";
import { PermissionsService } from "./permissions.service.js";
import { PERMISSIONS_STORE, type PermissionsStore } from "./permissions.types.js";
import { PostgresPermissionsStore } from "./postgres-permissions.store.js";

const logger = createLogger("dang-api-permissions");

function buildStore(): PermissionsStore {
  const env = loadAppEnv();
  return createPersistenceStore<PermissionsStore>({
    name: "permissions store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPermissionsStore.fromConnectionString(url),
    createMemory: () => new MemoryPermissionsStore(),
  });
}

@Global()
@Module({
  imports: [AuthModule, IamModule],
  controllers: [PermissionsController],
  providers: [
    PermissionsService,
    { provide: PERMISSIONS_STORE, useFactory: buildStore },
  ],
  exports: [PERMISSIONS_STORE, PermissionsService],
})
export class PermissionsModule {}
