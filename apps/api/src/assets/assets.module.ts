import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { ASSETS_STORE, MemoryAssetsStore } from "./assets.store.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

@Module({
  imports: [AuthModule, ProcurementModule],
  controllers: [AssetsController],
  providers: [
    AssetsService,
    { provide: ASSETS_STORE, useFactory: () => new MemoryAssetsStore() },
  ],
})
export class AssetsModule {}
