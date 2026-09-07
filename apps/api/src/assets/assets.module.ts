import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { ASSETS_STORE, MemoryAssetsStore, type AssetsStore } from "./assets.store.js";
import { PostgresAssetsStore } from "./postgres-assets.store.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

const logger = createLogger("dang-api-assets");

export function createAssetsStore(): AssetsStore {
  const env = loadAppEnv();
  return createPersistenceStore<AssetsStore>({
    name: "assets store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresAssetsStore.fromConnectionString(url),
    createMemory: () => new MemoryAssetsStore(),
  });
}

@Module({
  imports: [AuthModule, ProcurementModule],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    { provide: ASSETS_STORE, useFactory: createAssetsStore },
  ],
  exports: [ASSETS_STORE],
})
export class AssetsModule {}
