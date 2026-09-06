import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  financeVerticalSliceSteps,
  partnershipVerticalSliceSteps,
  paymentHardeningNotes,
  procurementVerticalSliceSteps,
} from "@dang/contracts";
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
} from "@dang/config";
import { MailerService } from "../auth/mailer.service.js";
import { ACCOUNT_STORE, type AccountStore } from "../auth/account.types.js";
import type { AssetsStore } from "../assets/assets.store.js";
import { ASSETS_STORE } from "../assets/assets.store.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "../attachments/attachment.store.js";
import { AttachmentBlobService } from "../attachments/attachment-blob.service.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { BILLING_STORE, type BillingStore } from "../billing/billing.types.js";
import { COMMENT_STORE, type CommentStore } from "../comments/comment.store.js";
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
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { PROPOSAL_STORE, type ProposalStore } from "../proposals/proposal.types.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "../personal-finance/personal-resources.types.js";
import { SETTLEMENT_STORE, type SettlementStore } from "../settlements/settlement.types.js";

type Persistence = "memory" | "postgres";

type CapabilitiesResponse = {
  version: string;
  allowDevAuth: boolean;
  oidcConfigured: boolean;
  databaseConfigured: boolean;
  /** TOTP MFA endpoints are implemented in this build. */
  mfa: true;
  readiness: "ready" | "degraded";
  persistence: {
    iam: Persistence;
    audit: Persistence;
    ledger: Persistence;
    expense: Persistence;
    settlement: Persistence;
    partnership: Persistence;
    procurement: Persistence;
    proposals: Persistence;
    billing: Persistence;
    comment: Persistence;
    notification: Persistence;
    attachment: Persistence;
    payment: Persistence;
    asset: Persistence;
    personalFinance: Persistence;
    workspaceDay: Persistence;
    workspaceRangeLock: Persistence;
    account: Persistence;
    procurementVendorPoDelivery: Persistence;
    attachmentBlob: "local" | "none";
  };
  stubs: {
    paymentProvider: boolean;
    ocr: boolean;
    avScan: boolean;
    backgroundWorker: boolean;
    emailDelivery: boolean;
  };
  providers: {
    payment: "stub" | "zarinpal";
    ocr: "stub" | "configured";
    antivirus: "stub" | "configured";
    jobs: "inline_stub" | "redis_queue";
    email: "log" | "resend" | "smtp" | "none";
    attachmentBlob: "local" | "none";
  };
  integrationsReady: {
    zarinpal: { merchantConfigured: boolean; enabled: boolean };
    clamav: { hostConfigured: boolean; enabled: boolean };
    smtp: { urlConfigured: boolean; enabled: boolean };
    ocrHttp: { urlConfigured: boolean; enabled: boolean };
    workerConsumer: { redisConfigured: boolean; heartbeatAlive: boolean };
  };
  financeVerticalSlice: readonly string[];
  procurementVerticalSlice: readonly string[];
  partnershipVerticalSlice: readonly string[];
  paymentHardening: readonly string[];
};

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
    @Inject(COMMENT_STORE) private readonly comments: CommentStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(AttachmentBlobService) private readonly attachmentBlobs: AttachmentBlobService,
    @Inject(PAYMENT_STORE) private readonly payments: PaymentStore,
    @Inject(ASSETS_STORE) private readonly assets: AssetsStore,
    @Inject(PERSONAL_RESOURCES_STORE) private readonly personalFinance: PersonalResourcesStore,
    @Inject(WORKSPACE_DAY_STORE) private readonly workspaceDays: WorkspaceDayStore,
    @Inject(WORKSPACE_RANGE_LOCK_STORE) private readonly rangeLocks: WorkspaceRangeLockStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  @Get("capabilities")
  @ApiOperation({ summary: "Runtime capabilities and store persistence (no decorative flags)" })
  @ApiOkResponse({ schema: { example: { version: "0.1.0" } } })
  async getCapabilities(): Promise<CapabilitiesResponse> {
    const env = loadAppEnv();
    const databaseConfigured = Boolean(env.databaseUrl);
    const degraded = Boolean(process.env.DANG_REQUIRE_POSTGRES === "1" && !databaseConfigured);
    const zarinpalLive = isZarinpalLive(env.zarinpalMerchantId);
    const clamLive = isClamavLive();
    const ocrLive = isOcrLive();
    const mailMode = this.mailer.mode();
    const workerAlive = await this.jobs.consumerAlive();
    const redisConfigured = isRedisConfigured(env);

    return {
      version: "0.1.0",
      allowDevAuth: env.allowDevAuth,
      oidcConfigured: isOidcConfigured(env),
      databaseConfigured,
      mfa: true,
      readiness: degraded ? "degraded" : "ready",
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
        workspaceDay: this.workspaceDays.persistence,
        workspaceRangeLock: this.rangeLocks.persistence,
        account: this.accounts.persistence,
        procurementVendorPoDelivery: this.procurement.persistence,
        attachmentBlob: this.attachmentBlobs.mode(),
      },
      stubs: {
        paymentProvider: !zarinpalLive,
        ocr: !ocrLive,
        avScan: !clamLive,
        backgroundWorker: !(redisConfigured && workerAlive),
        emailDelivery: !this.mailer.isLiveDelivery(),
      },
      providers: {
        payment: zarinpalLive ? "zarinpal" : "stub",
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
