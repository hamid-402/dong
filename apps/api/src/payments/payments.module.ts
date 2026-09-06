import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { MemoryPaymentStore, PAYMENT_STORE, type PaymentStore } from "./payment.store.js";
import { PostgresPaymentStore } from "./postgres-payment.store.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { ZarinpalCallbackController } from "./zarinpal-callback.controller.js";

const logger = createLogger("dang-api-payments");

export function createPaymentStore(): PaymentStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory payment store");
    return new MemoryPaymentStore();
  }
  try {
    logger.info("Using PostgreSQL payment store");
    return PostgresPaymentStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL payment store; falling back to memory", {
      detail,
    });
    return new MemoryPaymentStore();
  }
}

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, ZarinpalCallbackController],
  providers: [
    PaymentsService,
    { provide: PAYMENT_STORE, useFactory: createPaymentStore },
  ],
  exports: [PaymentsService, PAYMENT_STORE],
})
export class PaymentsModule {}
