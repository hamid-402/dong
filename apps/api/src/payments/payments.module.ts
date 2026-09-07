import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { SettlementsModule } from "../settlements/settlements.module.js";
import { MemoryPaymentStore, PAYMENT_STORE, type PaymentStore } from "./payment.store.js";
import { PostgresPaymentStore } from "./postgres-payment.store.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
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

@Global()
@Module({
  imports: [AuthModule, SettlementsModule, BillingModule],
  controllers: [PaymentsController, ZarinpalCallbackController],
  providers: [
    PaymentsService,
    { provide: PAYMENT_STORE, useFactory: createPaymentStore },
  ],
  exports: [PaymentsService, PAYMENT_STORE],
})
export class PaymentsModule {}
