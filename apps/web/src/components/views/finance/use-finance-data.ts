import type {
  ExpensePeriodSummary,
  MemberInvoiceSummary,
  PaymentLinkSummary,
} from "@dang/contracts";
import { api } from "@/lib/api";

export async function loadWorkspaceData(workspaceId: string, periodId?: string) {
  const [expenses, settlements, auditEvents, members, balances, ledgerEntries, paymentLinks, periods] =
    await Promise.all([
      api.listExpenses(workspaceId),
      api.listSettlements(workspaceId),
      api.listAuditEvents(workspaceId),
      api.listMembers(workspaceId),
      api.getBalances(workspaceId),
      api.listLedgerEntries(workspaceId),
      api.listPaymentLinks(workspaceId).catch(() => [] as PaymentLinkSummary[]),
      api.listPeriods(workspaceId).catch(() => [] as ExpensePeriodSummary[]),
    ]);
  const activePeriodId =
    periodId && periods.some((p) => p.id === periodId)
      ? periodId
      : (periods[0]?.id ?? "");
  const invoices = activePeriodId
    ? await api.listPeriodInvoices(workspaceId, activePeriodId).catch(() => [] as MemberInvoiceSummary[])
    : [];
  return {
    expenses,
    settlements,
    auditEvents,
    members,
    balances,
    ledgerEntries,
    paymentLinks,
    periods,
    activePeriodId,
    invoices,
  };
}

export type FinanceWorkspaceData = Awaited<ReturnType<typeof loadWorkspaceData>>;
