import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { KeyVaultService } from "./key-vault.service.js";
import { KEY_VAULT_STORE, type VaultStore } from "./key-vault.types.js";
import { MemoryVaultStore } from "./memory-vault.store.js";
import { PostgresVaultStore } from "./postgres-vault.store.js";
import {
  createMasterKeyProvider,
  MASTER_KEY_PROVIDER,
} from "./master-key-provider.js";
import {
  VAULT_ACCESS_LOG_STORE,
  type VaultAccessLogStore,
} from "./vault-access-log.types.js";
import { MemoryVaultAccessLogStore } from "./memory-vault-access-log.store.js";
import { PostgresVaultAccessLogStore } from "./postgres-vault-access-log.store.js";

const logger = createLogger("dang-api-key-vault-store");

export function createKeyVaultStore(): VaultStore {
  const env = loadAppEnv();
  return createPersistenceStore<VaultStore>({
    name: "key vault store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresVaultStore.fromConnectionString(url),
    createMemory: () => new MemoryVaultStore(),
  });
}

export function createVaultAccessLogStore(): VaultAccessLogStore {
  const env = loadAppEnv();
  return createPersistenceStore<VaultAccessLogStore>({
    name: "vault access log store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresVaultAccessLogStore.fromConnectionString(url),
    createMemory: () => new MemoryVaultAccessLogStore(),
  });
}

/** Core vault (no Auth import) so MFA/jobs can inject before admin routes load. */
@Global()
@Module({
  providers: [
    { provide: KEY_VAULT_STORE, useFactory: createKeyVaultStore },
    { provide: VAULT_ACCESS_LOG_STORE, useFactory: createVaultAccessLogStore },
    { provide: MASTER_KEY_PROVIDER, useFactory: () => createMasterKeyProvider() },
    KeyVaultService,
  ],
  exports: [KeyVaultService, KEY_VAULT_STORE, VAULT_ACCESS_LOG_STORE, MASTER_KEY_PROVIDER],
})
export class KeyVaultModule {}
