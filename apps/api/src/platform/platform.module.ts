import { Global, Module, forwardRef } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MemoryPlatformBreakGlassStore } from "./memory-platform.store.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";
import {
  PLATFORM_BREAK_GLASS_STORE,
  type PlatformBreakGlassStore,
} from "./platform.types.js";
import { PostgresPlatformBreakGlassStore } from "./postgres-platform.store.js";

const logger = createLogger("dang-api-platform");

function buildStore(): PlatformBreakGlassStore {
  const env = loadAppEnv();
  return createPersistenceStore<PlatformBreakGlassStore>({
    name: "platform break-glass store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresPlatformBreakGlassStore.fromConnectionString(url),
    createMemory: () => new MemoryPlatformBreakGlassStore(),
  });
}

@Global()
@Module({
  imports: [forwardRef(() => AuthModule), AuditModule],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    { provide: PLATFORM_BREAK_GLASS_STORE, useFactory: buildStore },
  ],
  exports: [PlatformService, PLATFORM_BREAK_GLASS_STORE],
})
export class PlatformModule {}
