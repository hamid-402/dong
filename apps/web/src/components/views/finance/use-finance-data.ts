import type {
  ExpenseListQuery,
  ExpensePeriodSummary,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  PaymentLinkSummary,
} from "@dang/contracts";
import { api } from "@/lib/api";

export type FinanceSection =
  | "expenses"
  | "settlements"
  | "invoices"
  | "recurring";

export type FinanceLoadScope = FinanceSection | "all";

/**
 * Section-scoped workspace finance fetch — only hit APIs the active section renders.
 * Members are always loaded (forms / labels). Empty arrays for unused sections.
 */
export async function loadWorkspaceData(
  workspaceId: string,
  periodId?: string,
  expenseQuery?: ExpenseListQuery,
  scope: FinanceLoadScope = "all",
) {
  const needExpenses = scope === "all" || scope === "expenses";
  const needSettlements = scope === "all" || scope === "settlements";
  const needInvoices = scope === "all" || scope === "invoices";
  const needRecurring = scope === "all" || scope === "recurring";
  const needBalances = needExpenses || needSettlements;
  const needPaymentLinks = needSettlements || needInvoices;
  const needPeriods = needExpenses || needInvoices || needRecurring;
  const needLedger = needRecurring;
  const needAudit = needRecurring;

  let periodsError: string | null = null;

  const [
    members,
    expenses,
    settlements,
    auditEvents,
    balances,
    ledgerEntries,
    paymentLinks,
    periods,
  ] = await Promise.all([
    api.listMembers(workspaceId),
    needExpenses
      ? api.listExpenses(workspaceId, expenseQuery)
      : Promise.resolve([]),
    needSettlements ? api.listSettlements(workspaceId) : Promise.resolve([]),
    needAudit ? api.listAuditEvents(workspaceId) : Promise.resolve([]),
    needBalances ? api.getBalances(workspaceId) : Promise.resolve(null),
    needLedger ? api.listLedgerEntries(workspaceId) : Promise.resolve([]),
    needPaymentLinks
      ? api.listPaymentLinks(workspaceId).catch(() => [] as PaymentLinkSummary[])
      : Promise.resolve([] as PaymentLinkSummary[]),
    needPeriods
      ? api.listPeriods(workspaceId).catch((err: unknown) => {
          periodsError =
            err instanceof Error && err.message.trim()
              ? err.message.trim()
              : "بارگذاری دوره‌های مالی ناموفق بود";
          return [] as ExpensePeriodSummary[];
        })
      : Promise.resolve([] as ExpensePeriodSummary[]),
  ]);

  const activePeriodId =
    periodId && periods.some((p) => p.id === periodId)
      ? periodId
      : (periods[0]?.id ?? "");
  const [invoices, invoiceAdjustments] =
    needInvoices && activePeriodId
      ? await Promise.all([
          api
            .listPeriodInvoices(workspaceId, activePeriodId)
            .catch(() => [] as MemberInvoiceSummary[]),
          api
            .listInvoiceAdjustments(workspaceId, activePeriodId)
            .catch(() => [] as MemberInvoiceAdjustmentSummary[]),
        ])
      : [[] as MemberInvoiceSummary[], [] as MemberInvoiceAdjustmentSummary[]];

  return {
    expenses,
    settlements,
    auditEvents,
    members,
    balances,
    ledgerEntries,
    paymentLinks,
    periods,
    periodsError,
    activePeriodId,
    invoices,
    invoiceAdjustments,
  };
}

export type FinanceWorkspaceData = Awaited<ReturnType<typeof loadWorkspaceData>>;
