import { Module } from "@nestjs/common";
import { KeyVaultModule } from "../key-vault/key-vault.module.js";
import { StatementsModule } from "../statements/statements.module.js";
import { RetentionController } from "./retention.controller.js";
import { RetentionService } from "./retention.service.js";

/**
 * AttachmentsModule is @Global — do not import it here.
 * Importing Attachments alongside Statements→Expenses recreates the TDZ cycle.
 */
@Module({
  imports: [StatementsModule, KeyVaultModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
