import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AssetsModule } from "./assets/assets.module.js";
import { AttachmentsModule } from "./attachments/attachments.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BalancesModule } from "./balances/balances.module.js";
import { CommentsModule } from "./comments/comments.module.js";
import { IdempotencyModule } from "./common/idempotency.module.js";
import { RequestIdInterceptor } from "./common/request-id.interceptor.js";
import { DemoModule } from "./demo/demo.module.js";
import { ExpensesModule } from "./expenses/expenses.module.js";
import { HealthController } from "./health/health.controller.js";
import { IamModule } from "./iam/iam.module.js";
import { InvitesModule } from "./invites/invites.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LedgerModule } from "./ledger/ledger.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { PartnershipModule } from "./partnership/partnership.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { ProcurementModule } from "./procurement/procurement.module.js";
import { SettlementsModule } from "./settlements/settlements.module.js";
import { SystemController } from "./system/system.controller.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { ProposalsModule } from "./proposals/proposals.module.js";
import { PersonalFinanceModule } from "./personal-finance/personal-finance.module.js";

@Module({
  imports: [
    IamModule,
    AuditModule,
    IdempotencyModule,
    AuthModule,
    WorkspacesModule,
    InvitesModule,
    LedgerModule,
    ExpensesModule,
    SettlementsModule,
    BalancesModule,
    CommentsModule,
    AttachmentsModule,
    NotificationsModule,
    JobsModule,
    ProcurementModule,
    ProposalsModule,
    AssetsModule,
    PartnershipModule,
    PaymentsModule,
    BillingModule,
    ReportsModule,
    PersonalFinanceModule,
    DemoModule,
  ],
  controllers: [HealthController, SystemController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
  ],
})
export class AppModule {}
