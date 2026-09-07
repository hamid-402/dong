import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { ACCOUNT_STORE, type AccountStore } from "./account.types.js";
import { AuthController } from "./auth.controller.js";
import { AuthOidcController } from "./auth-oidc.controller.js";
import { SessionAuthGuard } from "./auth.guard.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { MailerService } from "./mailer.service.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { MfaService } from "./mfa.service.js";
import { OidcService } from "./oidc.service.js";
import { PostgresAccountStore } from "./postgres-account.store.js";

const logger = createLogger("dang-api-account-store");

function createAccountStore(): AccountStore {
  const env = loadAppEnv();
  return createPersistenceStore<AccountStore>({
    name: "account store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresAccountStore.fromConnectionString(url),
    createMemory: () => new MemoryAccountStore(),
  });
}

@Module({
  controllers: [AuthController, AuthOidcController, AccountController],
  providers: [
    AccountService,
    MfaService,
    MailerService,
    OidcService,
    SessionAuthGuard,
    {
      provide: ACCOUNT_STORE,
      useFactory: createAccountStore,
    },
  ],
  exports: [
    SessionAuthGuard,
    AccountService,
    MfaService,
    ACCOUNT_STORE,
    OidcService,
    MailerService,
  ],
})
export class AuthModule {}
