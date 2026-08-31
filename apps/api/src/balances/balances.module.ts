import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { BalancesController } from "./balances.controller.js";
import { BalancesService } from "./balances.service.js";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [BalancesController],
  providers: [BalancesService],
})
export class BalancesModule {}
