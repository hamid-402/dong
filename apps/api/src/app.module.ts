import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AddonChargesModule } from "./addon-charges/addon-charges.module.js";
import { ActivityModule } from "./activity/activity.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { AttachmentsModule } from "./attachments/attachments.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { SecurityEventsModule } from "./security-events/security-events.module.js";
import { BalancesModule } from "./balances/balances.module.js";
import { CommentsModule } from "./comments/comments.module.js";
import { CostCentersModule } from "./cost-centers/cost-centers.module.js";
import { SubunitsModule } from "./subunits/subunits.module.js";
import { BuildingChargesModule } from "./building-charges/building-charges.module.js";
import { IdempotencyModule } from "./common/idempotency.module.js";
import { RequestIdInterceptor } from "./common/request-id.interceptor.js";
import { DemoModule } from "./demo/demo.module.js";
import { ExpensesModule } from "./expenses/expenses.module.js";
import { GuestsModule } from "./guests/guests.module.js";
import { SplitPresetsModule } from "./split-presets/split-presets.module.js";
import { HealthController } from "./health/health.controller.js";
import { IamModule } from "./iam/iam.module.js";
import { InvitesModule } from "./invites/invites.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { KeyVaultModule } from "./key-vault/key-vault.module.js";
import { KeyVaultAdminModule } from "./key-vault/key-vault-admin.module.js";
import { LedgerModule } from "./ledger/ledger.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OutboxModule } from "./outbox/outbox.module.js";
import { PartnershipModule } from "./partnership/partnership.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { ProcurementModule } from "./procurement/procurement.module.js";
import { SettlementsModule } from "./settlements/settlements.module.js";
import { MakerCheckerModule } from "./maker-checker/maker-checker.module.js";
import { MessagingModule } from "./messaging/messaging.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";
import { SystemController } from "./system/system.controller.js";
import { PublicContactController } from "./system/public-contact.controller.js";
import { PublicContactService } from "./system/public-contact.service.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { ReportViewsModule } from "./report-views/report-views.module.js";
import { ProposalsModule } from "./proposals/proposals.module.js";
import { PersonalFinanceModule } from "./personal-finance/personal-finance.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { AllowancesModule } from "./allowances/allowances.module.js";
import { ApprovalQueueModule } from "./approval-queue/approval-queue.module.js";
import { ExpensePolicyModule } from "./expense-policy/expense-policy.module.js";
import { ReimbursementsModule } from "./reimbursements/reimbursements.module.js";
import { CategoryBudgetsModule } from "./category-budgets/category-budgets.module.js";
import { FxRatesModule } from "./fx-rates/fx-rates.module.js";
import { WaveFSettingsModule } from "./wave-f-settings/wave-f-settings.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { SaasBillingModule } from "./saas-billing/saas-billing.module.js";
import { SocialModule } from "./social/social.module.js";
import { MembershipModule } from "./membership/membership.module.js";
import { PermissionsModule } from "./permissions/permissions.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { ChartsModule } from "./charts/charts.module.js";
import { StatementsModule } from "./statements/statements.module.js";
import { RetentionModule } from "./retention/retention.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { SloModule } from "./slo/slo.module.js";

@Module({
  imports: [
    IamModule,
    AuditModule,
    SecurityEventsModule,
    IdempotencyModule,
    OutboxModule,
    MessagingModule,
    WebhooksModule,
    KeyVaultModule,
    AuthModule,
    KeyVaultAdminModule,
    PlatformModule,
    SloModule,
    SocialModule,
    MembershipModule,
    CatalogModule,
    ChartsModule,
    JobsModule,
    AttachmentsModule,
    StatementsModule,
    RetentionModule,
    MakerCheckerModule,
    PermissionsModule,
    WorkspacesModule,
    InvitesModule,
    LedgerModule,
    ExpensesModule,
    GuestsModule,
    SplitPresetsModule,
    SettlementsModule,
    BalancesModule,
    CommentsModule,
    CostCentersModule,
    SubunitsModule,
    BuildingChargesModule,
    NotificationsModule,
    ActivityModule,
    ProcurementModule,
    ProposalsModule,
    AssetsModule,
    PartnershipModule,
    PaymentsModule,
    BillingModule,
    AddonChargesModule,
    ReportsModule,
    ReportViewsModule,
    AnalyticsModule,
    SaasBillingModule,
    PersonalFinanceModule,
    DashboardModule,
    AllowancesModule,
    ExpensePolicyModule,
    ApprovalQueueModule,
    ReimbursementsModule,
    CategoryBudgetsModule,
    FxRatesModule,
    WaveFSettingsModule,
    DemoModule.register(),
  ],
  controllers: [HealthController, SystemController, PublicContactController],
  providers: [
    PublicContactService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
  ],
})
export class AppModule {}
