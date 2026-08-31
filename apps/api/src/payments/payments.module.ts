import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MemoryPaymentStore, PAYMENT_STORE } from "./payment.store.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: PAYMENT_STORE, useFactory: () => new MemoryPaymentStore() },
  ],
})
export class PaymentsModule {}
