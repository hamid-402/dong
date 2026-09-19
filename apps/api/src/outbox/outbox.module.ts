import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { MemoryOutboxStore } from "./memory-outbox.store.js";
import { OutboxRelay } from "./outbox.relay.js";
import { OUTBOX_STORE, type OutboxStore } from "./outbox.types.js";
import { PostgresOutboxStore } from "./postgres-outbox.store.js";

const logger = createLogger("dang-api-outbox");

export function createOutboxStore(): OutboxStore {
  const env = loadAppEnv();
  return createPersistenceStore<OutboxStore>({
    name: "outbox store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresOutboxStore.fromConnectionString(url),
    createMemory: () => new MemoryOutboxStore(),
  });
}

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [
    { provide: OUTBOX_STORE, useFactory: createOutboxStore },
    OutboxRelay,
  ],
  exports: [OUTBOX_STORE, OutboxRelay],
})
export class OutboxModule {}
