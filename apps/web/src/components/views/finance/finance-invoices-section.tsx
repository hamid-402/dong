"use client";

import type {
  ExpensePeriodSummary,
  FundingSourceKind,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  PaymentLinkSummary,
  PeriodKind,
  SessionSummary,
} from "@dang/contracts";
import { Button } from "@dang/ui";
import { ProductGrid, StatusLine } from "@/components/ui-blocks";
import { PeriodInvoicePanels } from "@/components/views/finance/period-invoice-panels";

export function FinanceInvoicesSection(props: {
  periodsError: string | null;
  pending: boolean;
  onRefresh: () => void;
  periods: ExpensePeriodSummary[];
  periodTitle: string;
  onPeriodTitleChange: (v: string) => void;
  periodKind: PeriodKind;
  onPeriodKindChange: (v: PeriodKind) => void;
  periodStartsOn: string;
  onPeriodStartsOnChange: (v: string) => void;
  periodEndsOn: string;
  onPeriodEndsOnChange: (v: string) => void;
  selectedPeriodId: string;
  onSelectPeriodId: (id: string) => void;
  invoices: MemberInvoiceSummary[];
  invoiceAdjustments: MemberInvoiceAdjustmentSummary[];
  paymentLinks: PaymentLinkSummary[];
  paymentsLive: boolean;
  session: SessionSummary | null;
  memberLabel: (userId: string) => string;
  slug: string | null;
  canManageInvoices: boolean;
  automation?: {
    mode: "live_invoice_sweep_v1" | "live_invoice_v1";
    reconcile?: "off" | "expense_invoice_v1" | "expense_ledger_invoice_v1";
  } | null;
  onCreatePeriod: () => void;
  onGenerateInvoices: () => void;
  onClosePeriod: () => void;
  onCancelPeriod: () => void;
  onApproveInvoice: (invoiceId: string) => void;
  onDisputeInvoice: (invoiceId: string) => void;
  onResolveInvoiceDispute: (invoiceId: string, outcome: "accepted" | "rejected") => void;
  onIssueInvoice: (invoiceId: string) => void;
  onMarkInvoicePaid: (invoiceId: string) => void;
  expenseFundingById?: Readonly<Record<string, FundingSourceKind | undefined>>;
}) {
  return (
    <ProductGrid cols={2}>
      {props.periodsError ? (
        <StatusLine>
          دوره‌های مالی بارگذاری نشد: {props.periodsError} — بقیهٔ صفحه از دادهٔ واقعی است؛ بعد از
          رفع اسکیما/سرور دوباره تلاش کنید.{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={props.onRefresh}
            disabled={props.pending}
          >
            تلاش دوباره
          </Button>
        </StatusLine>
      ) : null}
      <PeriodInvoicePanels
        periods={props.periods}
        periodTitle={props.periodTitle}
        onPeriodTitleChange={props.onPeriodTitleChange}
        periodKind={props.periodKind}
        onPeriodKindChange={props.onPeriodKindChange}
        periodStartsOn={props.periodStartsOn}
        onPeriodStartsOnChange={props.onPeriodStartsOnChange}
        periodEndsOn={props.periodEndsOn}
        onPeriodEndsOnChange={props.onPeriodEndsOnChange}
        selectedPeriodId={props.selectedPeriodId}
        onSelectPeriodId={props.onSelectPeriodId}
        invoices={props.invoices}
        invoiceAdjustments={props.invoiceAdjustments}
        paymentLinks={props.paymentLinks}
        paymentsLive={props.paymentsLive}
        pending={props.pending}
        session={props.session}
        memberLabel={props.memberLabel}
        slug={props.slug}
        canManageInvoices={props.canManageInvoices}
        automation={props.automation}
        onCreatePeriod={props.onCreatePeriod}
        onGenerateInvoices={props.onGenerateInvoices}
        onClosePeriod={props.onClosePeriod}
        onCancelPeriod={props.onCancelPeriod}
        onApproveInvoice={props.onApproveInvoice}
        onDisputeInvoice={props.onDisputeInvoice}
        onResolveInvoiceDispute={props.onResolveInvoiceDispute}
        onIssueInvoice={props.onIssueInvoice}
        onMarkInvoicePaid={props.onMarkInvoicePaid}
        expenseFundingById={props.expenseFundingById}
      />
    </ProductGrid>
  );
}
