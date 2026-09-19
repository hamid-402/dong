import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { CATALOG_STORE, type CatalogStore } from "./catalog.types.js";
import { MemoryCatalogStore } from "./memory-catalog.store.js";
import { PostgresCatalogStore } from "./postgres-catalog.store.js";

const logger = createLogger("dang-api-catalog");

function buildCatalogStore(): CatalogStore {
  const env = loadAppEnv();
  return createPersistenceStore<CatalogStore>({
    name: "catalog store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresCatalogStore.fromConnectionString(url),
    createMemory: () => new MemoryCatalogStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    { provide: CATALOG_STORE, useFactory: buildCatalogStore },
  ],
  exports: [CATALOG_STORE, CatalogService],
})
export class CatalogModule {}
