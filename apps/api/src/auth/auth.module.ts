import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { ACCOUNT_STORE, type AccountStore } from "./account.types.js";
import { AuthController } from "./auth.controller.js";
import { AuthOidcController } from "./auth-oidc.controller.js";
import { SessionAuthGuard } from "./auth.guard.js";
import { MailerService } from "./mailer.service.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { OidcService } from "./oidc.service.js";
import { PostgresAccountStore } from "./postgres-account.store.js";

const logger = createLogger("dang-api-account-store");

function createAccountStore(): AccountStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory account store");
    return new MemoryAccountStore();
  }
  try {
    logger.info("Using PostgreSQL account store");
    return PostgresAccountStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL account store; falling back to memory", {
      detail,
    });
    return new MemoryAccountStore();
  }
}

@Module({
  controllers: [AuthController, AuthOidcController, AccountController],
  providers: [
    AccountService,
    MailerService,
    OidcService,
    SessionAuthGuard,
    {
      provide: ACCOUNT_STORE,
      useFactory: createAccountStore,
    },
  ],
  exports: [SessionAuthGuard, AccountService, ACCOUNT_STORE, OidcService, MailerService],
})
export class AuthModule {}
