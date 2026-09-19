import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { IamModule } from "../iam/iam.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MemoryWorkspaceWebhookStore } from "./memory-webhook.store.js";
import { PostgresWorkspaceWebhookStore } from "./postgres-webhook.store.js";
import { WORKSPACE_WEBHOOK_STORE, type WorkspaceWebhookStore } from "./webhook.store.js";
import { WebhooksController } from "./webhooks.controller.js";
import { WebhooksService } from "./webhooks.service.js";

const logger = createLogger("dang-api-webhooks");

function buildStore(): WorkspaceWebhookStore {
  const env = loadAppEnv();
  return createPersistenceStore<WorkspaceWebhookStore>({
    name: "workspace webhook store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresWorkspaceWebhookStore.fromConnectionString(url),
    createMemory: () => new MemoryWorkspaceWebhookStore(),
  });
}

@Global()
@Module({
  imports: [AuthModule, IamModule],
  controllers: [WebhooksController],
  providers: [
    { provide: WORKSPACE_WEBHOOK_STORE, useFactory: buildStore },
    WebhooksService,
  ],
  exports: [WebhooksService, WORKSPACE_WEBHOOK_STORE],
})
export class WebhooksModule {}
