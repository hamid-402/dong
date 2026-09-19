import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { KeyVaultController } from "./key-vault.controller.js";
import { KeyVaultModule } from "./key-vault.module.js";

/** Platform-owner admin HTTP surface for the local key vault. */
@Module({
  imports: [AuthModule, KeyVaultModule],
  controllers: [KeyVaultController],
})
export class KeyVaultAdminModule {}
