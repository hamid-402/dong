import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MemoryNotificationStore, NOTIFICATION_STORE } from "./notification.store.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_STORE, useFactory: () => new MemoryNotificationStore() },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
