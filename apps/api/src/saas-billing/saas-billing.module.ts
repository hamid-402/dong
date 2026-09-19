import { Module, forwardRef } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { WaveFSettingsModule } from "../wave-f-settings/wave-f-settings.module.js";
import { SaasBillingController } from "./saas-billing.controller.js";
import { SaasBillingService } from "./saas-billing.service.js";
import {
  MemorySaasBillingStore,
  SAAS_BILLING_STORE,
  type SaasBillingStore,
} from "./saas-billing.store.js";
import { PostgresSaasBillingStore } from "./postgres-saas-billing.store.js";

const logger = createLogger("dang-api-saas-billing");

function buildStore(): SaasBillingStore {
  const env = loadAppEnv();
  return createPersistenceStore<SaasBillingStore>({
    name: "saas billing store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresSaasBillingStore.fromConnectionString(url),
    createMemory: () => new MemorySaasBillingStore(),
  });
}

@Module({
  imports: [
    AuthModule,
    IamModule,
    ExpensesModule,
    WaveFSettingsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [SaasBillingController],
  providers: [
    SaasBillingService,
    { provide: SAAS_BILLING_STORE, useFactory: buildStore },
  ],
  exports: [SaasBillingService, SAAS_BILLING_STORE],
})
export class SaasBillingModule {}
