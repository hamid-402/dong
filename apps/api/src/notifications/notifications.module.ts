import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
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
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory notification store");
    return new MemoryNotificationStore();
  }
  try {
    logger.info("Using PostgreSQL notification store");
    return PostgresNotificationStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL notification store; falling back to memory", {
      detail,
    });
    return new MemoryNotificationStore();
  }
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
