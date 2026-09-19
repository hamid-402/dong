import { Global, Module, forwardRef } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { DualSecurityEventsStore } from "./dual-security-events.store.js";
import { MemorySecurityEventsStore } from "./memory-security-events.store.js";
import { PostgresSecurityEventsStore } from "./postgres-security-events.store.js";
import {
  SECURITY_EVENTS_STORE,
  SECURITY_EVENT_RECORDER,
  type SecurityEventsStore,
} from "./security-events.types.js";
import { SecurityEventsService } from "./security-events.service.js";
import { WorkspaceSecurityEventsController } from "./workspace-security-events.controller.js";

const logger = createLogger("dang-api-security-events-store");

export function createSecurityEventsStore(): SecurityEventsStore {
  const env = loadAppEnv();
  const url = env.databaseUrl?.trim();
  const memory = new MemorySecurityEventsStore();
  if (!url) {
    if (process.env.DANG_REQUIRE_POSTGRES === "1") {
      throw new Error(
        "DANG_REQUIRE_POSTGRES=1 but DATABASE_URL unset; refusing memory security events store",
      );
    }
    logger.warn("DATABASE_URL unset; using in-memory security events store");
    return memory;
  }
  try {
    logger.info("Using dual PostgreSQL + memory security events store");
    return new DualSecurityEventsStore(
      PostgresSecurityEventsStore.fromConnectionString(url),
      memory,
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error(
      "Failed to initialize PostgreSQL security events store; refusing memory-only fallback",
      { detail },
    );
    if (error instanceof Error) throw error;
    throw new Error(`Failed to initialize security events store: ${detail}`);
  }
}

@Global()
@Module({
  // Auth guards the controller; Auth's AccountService needs this module's
  // recorder — forwardRef breaks that init-time cycle so Nest can finish boot.
  imports: [forwardRef(() => AuthModule)],
  controllers: [WorkspaceSecurityEventsController],
  providers: [
    { provide: SECURITY_EVENTS_STORE, useFactory: createSecurityEventsStore },
    SecurityEventsService,
    { provide: SECURITY_EVENT_RECORDER, useExisting: SecurityEventsService },
  ],
  exports: [SECURITY_EVENTS_STORE, SecurityEventsService, SECURITY_EVENT_RECORDER],
})
export class SecurityEventsModule {}
