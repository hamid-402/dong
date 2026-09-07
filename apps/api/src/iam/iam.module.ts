import { Global, Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IAM_STORE, type IamStore } from "./iam.types.js";
import { MemoryIamStore } from "./memory-iam.store.js";
import { PostgresIamStore } from "./postgres-iam.store.js";

const logger = createLogger("dang-api-iam");

export function createIamStore(): IamStore {
  const env = loadAppEnv();
  return createPersistenceStore<IamStore>({
    name: "IAM store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresIamStore.fromConnectionString(url),
    createMemory: () => new MemoryIamStore(),
  });
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
