import { Global, Module, forwardRef } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { MakerCheckerModule } from "../maker-checker/maker-checker.module.js";
import { SaasBillingModule } from "../saas-billing/saas-billing.module.js";
import { SettlementsModule } from "../settlements/settlements.module.js";
import { MemoryPaymentStore, PAYMENT_STORE, type PaymentStore } from "./payment.store.js";
import { PostgresPaymentStore } from "./postgres-payment.store.js";
import { MemoryPaymentOpsStore } from "./memory-payment-ops.store.js";
import { PostgresPaymentOpsStore } from "./postgres-payment-ops.store.js";
import {
  PAYMENT_OPS_STORE,
  type PaymentOpsStore,
} from "./payment-ops.types.js";
import { LocalPspController } from "./local-psp.controller.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { WorkspacePaymentsController } from "./workspace-payments.controller.js";
import { WorkspacePaymentsService } from "./workspace-payments.service.js";
import { ZarinpalCallbackController } from "./zarinpal-callback.controller.js";

const logger = createLogger("dang-api-payments");

export function createPaymentStore(): PaymentStore {
  const env = loadAppEnv();
  return createPersistenceStore<PaymentStore>({
    name: "payment store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPaymentStore.fromConnectionString(url),
    createMemory: () => new MemoryPaymentStore(),
  });
}

export function createPaymentOpsStore(): PaymentOpsStore {
  const env = loadAppEnv();
  return createPersistenceStore<PaymentOpsStore>({
    name: "payment ops store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPaymentOpsStore.fromConnectionString(url),
    createMemory: () => new MemoryPaymentOpsStore(),
  });
}

@Global()
@Module({
  imports: [
    AuthModule,
    SettlementsModule,
    BillingModule,
    MakerCheckerModule,
    forwardRef(() => SaasBillingModule),
    forwardRef(() => ExpensesModule),
  ],
  controllers: [
    PaymentsController,
    WorkspacePaymentsController,
    ZarinpalCallbackController,
    LocalPspController,
  ],
  providers: [
    PaymentsService,
    WorkspacePaymentsService,
    { provide: PAYMENT_STORE, useFactory: createPaymentStore },
    { provide: PAYMENT_OPS_STORE, useFactory: createPaymentOpsStore },
  ],
  exports: [
    PaymentsService,
    WorkspacePaymentsService,
    PAYMENT_STORE,
    PAYMENT_OPS_STORE,
  ],
})
export class PaymentsModule {}
