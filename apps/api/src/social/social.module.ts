import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MemorySocialStore } from "./memory-social.store.js";
import { PostgresSocialStore } from "./postgres-social.store.js";
import { SocialController } from "./social.controller.js";
import { SocialService } from "./social.service.js";
import { SOCIAL_STORE, type SocialStore } from "./social.types.js";

const logger = createLogger("dang-api-social");

function buildSocialStore(): SocialStore {
  const env = loadAppEnv();
  return createPersistenceStore<SocialStore>({
    name: "social store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresSocialStore.fromConnectionString(url),
    createMemory: () => new MemorySocialStore(),
  });
}

@Module({
  imports: [AuthModule],
  controllers: [SocialController],
  providers: [
    SocialService,
    { provide: SOCIAL_STORE, useFactory: buildSocialStore },
  ],
  exports: [SOCIAL_STORE, SocialService],
})
export class SocialModule {}
