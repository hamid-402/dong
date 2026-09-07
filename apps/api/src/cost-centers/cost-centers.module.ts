import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { CostCentersController } from "./cost-centers.controller.js";
import { CostCentersService } from "./cost-centers.service.js";
import {
  COST_CENTER_STORE,
  type CostCenterStore,
} from "./cost-centers.types.js";
import { MemoryCostCenterStore } from "./memory-cost-center.store.js";
import { PostgresCostCenterStore } from "./postgres-cost-center.store.js";

const logger = createLogger("dang-api-cost-centers");

export function createCostCenterStore(): CostCenterStore {
  const env = loadAppEnv();
  return createPersistenceStore<CostCenterStore>({
    name: "cost center store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresCostCenterStore.fromConnectionString(url),
    createMemory: () => new MemoryCostCenterStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [CostCentersController],
  providers: [
    CostCentersService,
    {
      provide: COST_CENTER_STORE,
      useFactory: createCostCenterStore,
    },
  ],
  exports: [COST_CENTER_STORE],
})
export class CostCentersModule {}
