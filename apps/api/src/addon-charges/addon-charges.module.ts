import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { AddonChargesController } from "./addon-charges.controller.js";
import { AddonChargesService } from "./addon-charges.service.js";
import {
  ADDON_CHARGE_STORE,
  type AddonChargeStore,
} from "./addon-charges.types.js";
import { MemoryAddonChargeStore } from "./memory-addon-charge.store.js";
import { PostgresAddonChargeStore } from "./postgres-addon-charge.store.js";

const logger = createLogger("dang-api-addon-charges");

export function createAddonChargeStore(): AddonChargeStore {
  const env = loadAppEnv();
  return createPersistenceStore<AddonChargeStore>({
    name: "add-on charge store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) =>
      PostgresAddonChargeStore.fromConnectionString(url),
    createMemory: () => new MemoryAddonChargeStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [AddonChargesController],
  providers: [
    AddonChargesService,
    {
      provide: ADDON_CHARGE_STORE,
      useFactory: createAddonChargeStore,
    },
  ],
  exports: [ADDON_CHARGE_STORE],
})
export class AddonChargesModule {}
