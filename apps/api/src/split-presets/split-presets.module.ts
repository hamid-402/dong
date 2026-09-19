import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { IamModule } from "../iam/iam.module.js";
import { PostgresSplitPresetStore } from "./postgres-split-preset.store.js";
import {
  MemorySplitPresetStore,
  SPLIT_PRESET_STORE,
  type SplitPresetStore,
} from "./split-preset.store.js";
import { SplitPresetsController } from "./split-presets.controller.js";
import { SplitPresetsService } from "./split-presets.service.js";

const logger = createLogger("dang-api-split-presets");

function buildStore(): SplitPresetStore {
  const env = loadAppEnv();
  return createPersistenceStore<SplitPresetStore>({
    name: "split preset store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresSplitPresetStore.fromConnectionString(url),
    createMemory: () => new MemorySplitPresetStore(),
  });
}

@Module({
  imports: [AuthModule, IamModule],
  controllers: [SplitPresetsController],
  providers: [
    SplitPresetsService,
    { provide: SPLIT_PRESET_STORE, useFactory: buildStore },
  ],
  exports: [SplitPresetsService, SPLIT_PRESET_STORE],
})
export class SplitPresetsModule {}
