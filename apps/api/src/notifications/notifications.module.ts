import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import {
  MemoryNotificationStore,
  NOTIFICATION_STORE,
  type NotificationStore,
} from "./notification.store.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { PostgresNotificationStore } from "./postgres-notification.store.js";

const logger = createLogger("dang-api-notifications");

function buildNotificationStore(): NotificationStore {
  const env = loadAppEnv();
  return createPersistenceStore<NotificationStore>({
    name: "notification store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresNotificationStore.fromConnectionString(url),
    createMemory: () => new MemoryNotificationStore(),
  });
}

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_STORE, useFactory: buildNotificationStore },
  ],
  exports: [NotificationsService, NOTIFICATION_STORE],
})
export class NotificationsModule {}
