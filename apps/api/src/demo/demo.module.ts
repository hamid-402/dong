import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { LedgerModule } from "../ledger/ledger.module.js";
import { ProcurementModule } from "../procurement/procurement.module.js";
import { DemoController } from "./demo.controller.js";
import { DemoSeedService } from "./demo-seed.service.js";

@Module({
  imports: [
    AuthModule,
    IamModule,
    AuditModule,
    ExpensesModule,
    LedgerModule,
    ProcurementModule,
  ],
  controllers: [DemoController],
  providers: [DemoSeedService],
  exports: [DemoSeedService],
})
export class DemoModule {}
