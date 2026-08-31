import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { IAM_STORE, type IamStore } from "./iam.types.js";
import { MemoryIamStore } from "./memory-iam.store.js";
import { PostgresIamStore } from "./postgres-iam.store.js";

const logger = createLogger("dang-api-iam");

export function createIamStore(): IamStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory IAM store");
    return new MemoryIamStore();
  }

  try {
    logger.info("Using PostgreSQL IAM store");
    return PostgresIamStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL IAM store; falling back to memory", {
      detail,
    });
    return new MemoryIamStore();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: IAM_STORE,
      useFactory: createIamStore,
    },
  ],
  exports: [IAM_STORE],
})
export class IamModule {}
