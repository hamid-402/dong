import { Global, Module } from "@nestjs/common";
import { createMessagingAdapter } from "./messaging.adapters.js";
import { MessagingService } from "./messaging.service.js";
import { MESSAGING_ADAPTER } from "./messaging.types.js";
import { TransactionalSmsService } from "./transactional-sms.service.js";

@Global()
@Module({
  providers: [
    {
      provide: MESSAGING_ADAPTER,
      useFactory: () => createMessagingAdapter(),
    },
    MessagingService,
    TransactionalSmsService,
  ],
  exports: [MessagingService, MESSAGING_ADAPTER, TransactionalSmsService],
})
export class MessagingModule {}
