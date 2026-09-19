// Zod body-validation exempt: GET/body-less read controller. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, Optional } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  approvalQueueSlaHours,
  CHARTS_PROVIDER,
  financeVerticalSliceSteps,
  partnershipVerticalSliceSteps,
  paymentHardeningNotes,
  procurementVerticalSliceSteps,
  readProductFeatureFlags,
  resolveAnalyticsWarehouseMode,
  resolvePenTestEngagementStatus,
  resolveSecretsProviderMode,
  type SystemCapabilities,
} from "@dang/contracts";
import { resolveMessagingProvider } from "../messaging/messaging.types.js";
import { resolveSmsProvider } from "../messaging/transactional-sms.service.js";
import {
  isClamavHostConfigured,
  isClamavLive,
  isOcrHttpConfigured,
  isOcrLive,
  isOidcConfigured,
  isRedisConfigured,
  isSmtpLive,
  isSmtpUrlConfigured,
  isZarinpalLive,
  isZarinpalMerchantConfigured,
  loadAppEnv,
  resolvePaymentProviderMode,
} from "@dang/config";
import { MailerService } from "../auth/mailer.service.js";
import { ACCOUNT_STORE, type AccountStore } from "../auth/account.types.js";
import type { AssetsStore } from "../assets/assets.store.js";
import { ASSETS_STORE } from "../assets/assets.store.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "../attachments/attachment.store.js";
import { AttachmentBlobService } from "../attachments/attachment-blob.service.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import { BillingMaintenanceService } from "../billing/billing-maintenance.service.js";
import { COMMENT_STORE, type CommentStore } from "../comments/comment.store.js";
import {
  COST_CENTER_STORE,
  type CostCenterStore,
} from "../cost-centers/cost-centers.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import {
  WORKSPACE_DAY_STORE,
  type WorkspaceDayStore,
} from "../expenses/workspace-day.store.js";
import {
  WORKSPACE_RANGE_LOCK_STORE,
  type WorkspaceRangeLockStore,
} from "../expenses/workspace-range-lock.store.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { JobsService } from "../jobs/jobs.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NOTIFICATION_STORE, type NotificationStore } from "../notifications/notification.store.js";
import { PARTNERSHIP_STORE, type PartnershipStore } from "../partnership/partnership.types.js";
import { PAYMENT_STORE, type PaymentStore } from "../payments/payment.store.js";
import { WorkspacePaymentsService } from "../payments/workspace-payments.service.js";
import { evaluateReadiness } from "../health/readiness.js";
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { PROPOSAL_STORE, type ProposalStore } from "../proposals/proposal.types.js";
import {
  PERSONAL_GOALS_STORE,
  type PersonalGoalsStore,
} from "../personal-finance/personal-goals.types.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "../personal-finance/personal-resources.types.js";
import { resolveTracingMode } from "@dang/observability";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";
import { SETTLEMENT_STORE, type SettlementStore } from "../settlements/settlement.types.js";
import {
  ANALYTICS_STORE,
  type AnalyticsStore,
} from "../analytics/analytics.store.js";
import { PermissionsService } from "../permissions/permissions.service.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { StatementsService } from "../statements/statements.service.js";
import { PlatformService } from "../platform/platform.service.js";
import { KeyVaultService } from "../key-vault/key-vault.service.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { RealtimeHub } from "../notifications/realtime-hub.js";
import { SocialService } from "../social/social.service.js";
import { RetentionService } from "../retention/retention.service.js";
import { SloService } from "../slo/slo.service.js";
import { WebhooksService } from "../webhooks/webhooks.service.js";
import {
  APPROVAL_DECISION_STORE,
  type ApprovalDecisionStore,
} from "../maker-checker/approval-decision.types.js";
import { REPORTS_STORE, type ReportsStore } from "../reports/reports.store.js";
import {
  REPORT_VIEWS_STORE,
  type ReportViewsStore,
} from "../report-views/report-views.types.js";
import { BuildingChargesService } from "../building-charges/building-charges.service.js";

type CapabilitiesResponse = SystemCapabilities;

@ApiTags("system")
@Controller("system")
export class SystemController {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(PARTNERSHIP_STORE) private readonly partnership: PartnershipStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(PROPOSAL_STORE) private readonly proposals: ProposalStore,
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(BillingMaintenanceService)
    private readonly billingMaintenance: BillingMaintenanceService,
    @Inject(COMMENT_STORE) private readonly comments: CommentStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(AttachmentBlobService) private readonly attachmentBlobs: AttachmentBlobService,
    @Inject(PAYMENT_STORE) private readonly payments: PaymentStore,
    @Inject(WorkspacePaymentsService)
    private readonly workspacePayments: WorkspacePaymentsService,
    @Inject(ASSETS_STORE) private readonly assets: AssetsStore,
    @Inject(PERSONAL_RESOURCES_STORE) private readonly personalFinance: PersonalResourcesStore,
    @Inject(PERSONAL_GOALS_STORE) private readonly personalGoals: PersonalGoalsStore,
    @Inject(WORKSPACE_DAY_STORE) private readonly workspaceDays: WorkspaceDayStore,
    @Inject(WORKSPACE_RANGE_LOCK_STORE) private readonly rangeLocks: WorkspaceRangeLockStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(COST_CENTER_STORE) private readonly costCenters: CostCenterStore,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(ANALYTICS_STORE) private readonly analytics: AnalyticsStore,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(StatementsService) private readonly statements: StatementsService,
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
    @Inject(KeyVaultService) private readonly keyVault: KeyVaultService,
    @Inject(RealtimeHub) private readonly realtimeHub: RealtimeHub,
    @Inject(SocialService) private readonly social: SocialService,
    @Inject(RetentionService) private readonly retention: RetentionService,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
    @Inject(APPROVAL_DECISION_STORE)
    private readonly approvalDecisions: ApprovalDecisionStore,
    @Inject(REPORTS_STORE) private readonly reports: ReportsStore,
    @Inject(REPORT_VIEWS_STORE) private readonly reportViews: ReportViewsStore,
    @Optional()
    @Inject(BuildingChargesService)
    private readonly buildingCharges?: BuildingChargesService,
    @Optional() @Inject(SloService) private readonly slo?: SloService,
  ) {}

  @Get("capabilities")
  @ApiOperation({ summary: "Runtime capabilities and store persistence (no decorative flags)" })
  @ApiOkResponse({ schema: { example: { version: "0.1.0" } } })
  async getCapabilities(): Promise<CapabilitiesResponse> {
    const env = loadAppEnv();
    const databaseConfigured = Boolean(env.databaseUrl);
    const readiness = await evaluateReadiness({
      iamPersistence: this.iam.persistence,
      env,
    });
    const zarinpalLive = isZarinpalLive(env.zarinpalMerchantId);
    const paymentMode = resolvePaymentProviderMode(env.zarinpalMerchantId);
    const clamLive = isClamavLive();
    const ocrLive = isOcrLive();
    const mailMode = this.mailer.mode();
    const workerAlive = await this.jobs.consumerAlive();
    const redisConfigured = isRedisConfigured(env);

    return {
      version: "0.1.0",
      allowDevAuth: env.allowDevAuth,
      demoSeedAllowed:
        env.nodeEnv !== "production" && env.allowDevAuth,
      oidcConfigured: isOidcConfigured(env),
      databaseConfigured,
      mfa: true,
      readiness: readiness.status,
      productFlags: readProductFeatureFlags(process.env),
      persistence: {
        iam: this.iam.persistence,
        audit: this.audit.persistence,
        ledger: this.ledger.persistence,
        expense: this.expenses.persistence,
        settlement: this.settlements.persistence,
        partnership: this.partnership.persistence,
        procurement: this.procurement.persistence,
        proposals: this.proposals.persistence,
        billing: this.billing.persistence,
        comment: this.comments.persistence,
        notification: this.notifications.persistence,
        attachment: this.attachments.persistence,
        payment: this.payments.persistence,
        asset: this.assets.persistence,
        personalFinance: this.personalFinance.persistence,
        personalGoals: this.personalGoals.persistence,
        workspaceDay: this.workspaceDays.persistence,
        workspaceRangeLock: this.rangeLocks.persistence,
        account: this.accounts.persistence,
        costCenter: this.costCenters.persistence,
        procurementVendorPoDelivery: this.procurement.persistence,
        outbox: this.outbox.persistence,
        analytics: this.analytics.persistence,
        catalog: this.catalog.persistence(),
        statements: this.statements.persistence(),
        payoutInstructions: this.statements.payoutPersistence(),
        paymentOps: this.workspacePayments.persistence(),
        securityEvents: this.securityEvents.persistence,
        keyVault: this.keyVault.persistence(),
        social: this.social.persistence(),
        jobRuns: this.jobs.runsPersistence(),
        approvalDecisions: this.approvalDecisions.persistence,
        webhooks: this.webhooks.persistence,
        attachmentBlob: this.attachmentBlobs.mode(),
      },
      conversionLive: Boolean(env.databaseUrl),
      stubs: {
        // Derive from providers.payment — never hardcode. local_psp / zarinpal are live adapters.
        paymentProvider: paymentMode === "stub",
        ocr: !ocrLive,
        avScan: !clamLive,
        backgroundWorker: !(redisConfigured && workerAlive),
        emailDelivery: !this.mailer.isLiveDelivery(),
      },
      providers: {
        payment: paymentMode,
        ocr: ocrLive ? "configured" : "stub",
        antivirus: clamLive ? "configured" : "stub",
        jobs: redisConfigured ? "redis_queue" : "inline_stub",
        email:
          mailMode === "resend"
            ? "resend"
            : mailMode === "smtp"
              ? "smtp"
              : mailMode === "none"
                ? "none"
                : "log",
        attachmentBlob: this.attachmentBlobs.mode(),
        tracing: resolveTracingMode(),
        outbox: this.outbox.persistence === "postgres" ? "postgres" : "memory",
        auditIntegrity: "hash_chain",
        accessPolicy: "rbac_abac_grants_v1",
        permissions: this.permissions.persistence(),
        secrets: resolveSecretsProviderMode(process.env, {
          vaultStoreLive: this.keyVault.storeLive(),
        }),
        masterKeySource: this.keyVault.masterKeySource(),
        securityEvents:
          this.securityEvents.persistence === "postgres"
            ? "structured_log_store"
            : "structured_log",
        realtime: this.realtimeHub.providerMode(),
        offlineSync: "mutation_queue_v1",
        analyticsWarehouse: resolveAnalyticsWarehouseMode({
          persistence: this.analytics.persistence,
          analyticsDatabaseUrl: this.analytics.analyticsDatabaseUrlConfigured
            ? "configured"
            : null,
        }),
        penTest: resolvePenTestEngagementStatus(process.env),
        saasBilling: "metering_v1",
        antifraud: "heuristics_v1",
        makerChecker: (() => {
          const flags = readProductFeatureFlags(process.env);
          if (!flags.makerChecker) return "off";
          // Phase 2.3: multi-level tiers on approve hot path.
          return "four_eyes_tiers_v1";
        })(),
        makerCheckerSla: approvalQueueSlaHours(process.env) != null ? "hours_v1" : "off",
        ledgerRebuild: "ack_v1",
        billingAutomation:
          this.billingMaintenance.mode() === "sweep_v1"
            ? "live_invoice_sweep_v1"
            : "live_invoice_v1",
        invoiceReconcile: this.billingMaintenance.reconcileMode(),
        fx: env.databaseUrl ? "table" : "stub",
        displayUnit: "toman",
        social: "directory_friends_v1",
        catalog:
          this.catalog.persistence() === "postgres" ||
          this.catalog.persistence() === "memory"
            ? "catalog_v1"
            : "none",
        statements: this.statements.providerMode(),
        payoutInstructions: this.statements.payoutProviderMode(),
        payoutDestinationCrypto: this.statements.payoutDestinationCryptoMode(),
        paymentReceipts:
          this.workspacePayments.persistence() === "postgres" ||
          this.workspacePayments.persistence() === "memory"
            ? "manual_review_v1"
            : "none",
        pettyCash:
          this.workspacePayments.persistence() === "postgres" ||
          this.workspacePayments.persistence() === "memory"
            ? "fund_v1"
            : "none",
        paymentOnBehalf:
          this.workspacePayments.persistence() === "postgres" ||
          this.workspacePayments.persistence() === "memory"
            ? "on_behalf_v1"
            : "none",
        savingsGoals:
          this.personalGoals.persistence === "postgres" ||
          this.personalGoals.persistence === "memory"
            ? "goals_v1"
            : "none",
        charts: CHARTS_PROVIDER,
        reportExport:
          this.reports.persistence === "postgres" || this.reports.persistence === "memory"
            ? "csv_xlsx_ir_v1"
            : "none",
        accountantExport:
          this.reports.persistence === "postgres" || this.reports.persistence === "memory"
            ? "mohk_sepidar_v1"
            : "none",
        permissionsDryRun:
          this.permissions.persistence() === "postgres" ||
          this.permissions.persistence() === "memory"
            ? "dry_run_v1"
            : "none",
        expensePolicy: readProductFeatureFlags(process.env).expensePolicy
          ? "org_policy_g09_v1"
          : "none",
        reportViews:
          this.reportViews.persistence === "postgres" ||
          this.reportViews.persistence === "memory"
            ? "report_views_v1"
            : "none",
        platformAdmin: this.platform.persistence() ? "platform_v1" : "none",
        slo: this.slo ? "in_app_v1" : "none",
        retention: this.retention ? "dry_run_purge_v1" : "none",
        outboundWebhooks: "hmac_v1",
        fxProvider: (process.env.FX_PROVIDER_URL ?? "").trim() ? "http_v1" : "none",
        // Preview needs rate table (Postgres); conversionLive mirrors this.
        fxPreview: env.databaseUrl ? "preview_v1" : "none",
        notificationEventPrefs: "in_app_v1",
        buildingCharges: this.buildingCharges ? "building_charges_v1" : "none",
        partnerPrices:
          this.partnership.persistence === "postgres" ||
          this.partnership.persistence === "memory"
            ? "partner_prices_v1"
            : "none",
        assetDepreciation:
          this.assets.persistence === "postgres" || this.assets.persistence === "memory"
            ? "depreciation_v1"
            : "none",
        poExpenseLink:
          this.procurement.persistence === "postgres" ||
          this.procurement.persistence === "memory"
            ? "po_expense_v1"
            : "none",
        messaging: resolveMessagingProvider(process.env),
        sms: resolveSmsProvider(process.env),
        activityFeed: "activity_v1",
      },
      integrationsReady: {
        zarinpal: {
          merchantConfigured: isZarinpalMerchantConfigured(env.zarinpalMerchantId),
          enabled: zarinpalLive,
        },
        clamav: {
          hostConfigured: isClamavHostConfigured(),
          enabled: clamLive,
        },
        smtp: {
          urlConfigured: isSmtpUrlConfigured(env.smtpUrl),
          enabled: isSmtpLive(env.smtpUrl),
        },
        ocrHttp: {
          urlConfigured: isOcrHttpConfigured(),
          enabled: ocrLive,
        },
        workerConsumer: {
          redisConfigured,
          /** True only when Redis answers and worker heartbeat key is fresh. */
          heartbeatAlive: workerAlive,
        },
      },
      financeVerticalSlice: financeVerticalSliceSteps,
      procurementVerticalSlice: procurementVerticalSliceSteps,
      partnershipVerticalSlice: partnershipVerticalSliceSteps,
      paymentHardening: paymentHardeningNotes,
    };
  }
}
