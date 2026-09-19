import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { KeyVaultModule } from "../key-vault/key-vault.module.js";
import { StatementsModule } from "../statements/statements.module.js";
import { RetentionController } from "./retention.controller.js";
import { RetentionService } from "./retention.service.js";

/**
 * AttachmentsModule is @Global — do not import it here.
 * Importing Attachments alongside Statements→Expenses recreates the TDZ cycle.
 * AuthModule required for SessionAuthGuard + ACCOUNT_STORE on RetentionController.
 */
@Module({
  imports: [AuthModule, StatementsModule, KeyVaultModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
