import { Module } from "@nestjs/common";
import { AddonChargesModule } from "../addon-charges/addon-charges.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { IamModule } from "../iam/iam.module.js";
import { ApprovalQueueController } from "./approval-queue.controller.js";
import { ApprovalQueueService } from "./approval-queue.service.js";
import { ApprovalStepsModule } from "../approval-steps/approval-steps.module.js";

@Module({
  imports: [
    AuthModule,
    IamModule,
    AddonChargesModule,
    BillingModule,
    ExpensesModule,
    ApprovalStepsModule,
  ],
  controllers: [ApprovalQueueController],
  providers: [ApprovalQueueService],
})
export class ApprovalQueueModule {}
