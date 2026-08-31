import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  financeVerticalSliceSteps,
  partnershipVerticalSliceSteps,
  paymentHardeningNotes,
  procurementVerticalSliceSteps,
} from "@dang/contracts";
import { isOidcConfigured, loadAppEnv } from "@dang/config";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { PARTNERSHIP_STORE, type PartnershipStore } from "../partnership/partnership.types.js";
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { SETTLEMENT_STORE, type SettlementStore } from "../settlements/settlement.types.js";

type CapabilitiesResponse = {
  version: string;
  iamPersistence: "memory" | "postgres";
  auditPersistence: "memory" | "postgres";
  ledgerPersistence: "memory" | "postgres";
  expensePersistence: "memory" | "postgres";
  settlementPersistence: "memory" | "postgres";
  partnershipPersistence: "memory" | "postgres";
  procurementPersistence: "memory" | "postgres";
  allowDevAuth: boolean;
  oidcConfigured: boolean;
  financeVerticalSlice: readonly string[];
  procurementVerticalSlice: readonly string[];
  partnershipVerticalSlice: readonly string[];
  paymentHardening: readonly string[];
  phase2Complete: true;
  phase3Complete: true;
  phase4Complete: true;
  phase5Started: true;
  features: Record<string, boolean | readonly string[]>;
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
  ) {}

  @Get("capabilities")
  @ApiOperation({ summary: "Describe enabled capabilities" })
  @ApiOkResponse({ schema: { example: { version: "0.1.0", phase2Complete: true } } })
  getCapabilities(): CapabilitiesResponse {
    const env = loadAppEnv();
    return {
      version: "0.1.0",
      iamPersistence: this.iam.persistence,
      auditPersistence: this.audit.persistence,
      ledgerPersistence: this.ledger.persistence,
      expensePersistence: this.expenses.persistence,
      settlementPersistence: this.settlements.persistence,
      partnershipPersistence: this.partnership.persistence,
      procurementPersistence: this.procurement.persistence,
      allowDevAuth: env.allowDevAuth,
      oidcConfigured: isOidcConfigured(env),
      financeVerticalSlice: financeVerticalSliceSteps,
      procurementVerticalSlice: procurementVerticalSliceSteps,
      partnershipVerticalSlice: partnershipVerticalSliceSteps,
      paymentHardening: paymentHardeningNotes,
      phase2Complete: true,
      phase3Complete: true,
      phase4Complete: true,
      phase5Started: true,
      features: {
        workspaces: true,
        invites: true,
        auditEvents: true,
        expenseSplitMethods: ["equal", "amount", "percent", "shares"],
        expenseMultiPayer: true,
        comments: true,
        attachments: true,
        fileQuarantine: true,
        stubOcr: true,
        notifications: true,
        workerJobs: true,
        settlements: true,
        procurementNeeds: true,
        purchaseRequests: true,
        budgets: true,
        approvals: true,
        vendors: true,
        purchaseOrders: true,
        deliveries: true,
        assets: true,
        agreements: true,
        contributions: true,
        partnerLoans: true,
        withdrawals: true,
        ownershipShares: true,
        memberReports: true,
        reportCsvExport: true,
        periodLocks: true,
        offlineExpenseDrafts: true,
        pwa: true,
        paymentLinksNoCustody: true,
        healthLiveReady: true,
      },
    };
  }
}
