"use client";

import type {
  ExpensePeriodSummary,
  MemberInvoiceSummary,
  PaymentLinkSummary,
  PeriodKind,
  SessionSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { invoiceStatusLabel, periodStatusLabel } from "@/lib/status-labels";

type PeriodInvoicePanelsProps = {
  periods: ExpensePeriodSummary[];
  periodTitle: string;
  onPeriodTitleChange: (value: string) => void;
  periodKind: PeriodKind;
  onPeriodKindChange: (value: PeriodKind) => void;
  periodStartsOn: string;
  onPeriodStartsOnChange: (value: string) => void;
  periodEndsOn: string;
  onPeriodEndsOnChange: (value: string) => void;
  selectedPeriodId: string;
  onSelectPeriodId: (next: string) => void;
  invoices: MemberInvoiceSummary[];
  paymentLinks: PaymentLinkSummary[];
  paymentsLive: boolean;
  pending: boolean;
  session: SessionSummary | null;
  memberLabel: (userId: string) => string;
  onCreatePeriod: () => void;
  onGenerateInvoices: () => void;
  onClosePeriod: () => void;
  onCancelPeriod: () => void;
  onApproveInvoice: (invoiceId: string) => void;
  onDisputeInvoice: (invoiceId: string) => void;
  onIssueInvoice: (invoiceId: string) => void;
  onMarkInvoicePaid: (invoiceId: string) => void;
  /** مادرخرج / مدیر مالی — ساخت دوره، تولید و صدور صورتحساب */
  canManageInvoices?: boolean;
};

/**
 * Expense-period management + member-invoice lifecycle cards.
 * Extracted from finance-view.tsx (dong-50 #29) — presentational, driven by parent state/handlers.
 */
export function PeriodInvoicePanels({
  periods,
  periodTitle,
  onPeriodTitleChange,
  periodKind,
  onPeriodKindChange,
  periodStartsOn,
  onPeriodStartsOnChange,
  periodEndsOn,
  onPeriodEndsOnChange,
  selectedPeriodId,
  onSelectPeriodId,
  invoices,
  paymentLinks,
  paymentsLive,
  pending,
  session,
  memberLabel,
  onCreatePeriod,
  onGenerateInvoices,
  onClosePeriod,
  onCancelPeriod,
  onApproveInvoice,
  onDisputeInvoice,
  onIssueInvoice,
  onMarkInvoicePaid,
  canManageInvoices = false,
}: PeriodInvoicePanelsProps) {
  return (
    <>
      {canManageInvoices ? (
      <SectionCard
        id="period-invoice-panel"
        title="دوره هزینه (روز/هفته/ماه/سال)"
        badge={periods.length}
        delayClass="delay2"
      >
        <FormStack>
          <TextField
            label="عنوان دوره"
            value={periodTitle}
            onChange={(event) => onPeriodTitleChange(event.target.value)}
          />
          <SelectField
            label="نوع دوره"
            value={periodKind}
            onChange={(event) => onPeriodKindChange(event.target.value as PeriodKind)}
          >
            <option value="day">روز</option>
            <option value="week">هفته</option>
            <option value="month">ماه</option>
            <option value="year">سال</option>
            <option value="custom">سفارشی</option>
          </SelectField>
          {periodKind === "custom" ? (
            <>
              <JalaliDateField
                label="شروع دوره"
                value={periodStartsOn}
                onChange={onPeriodStartsOnChange}
              />
              <JalaliDateField
                label="پایان دوره"
                value={periodEndsOn}
                onChange={onPeriodEndsOnChange}
              />
            </>
          ) : null}
          <Button type="button" onClick={onCreatePeriod} disabled={pending}>
            ساخت دوره
          </Button>
        </FormStack>
        {periods.length > 0 ? (
          <SelectField
            label="دوره فعال"
            value={selectedPeriodId}
            onChange={(event) => onSelectPeriodId(event.target.value)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.title} · {period.kind} · {periodStatusLabel(period.status)}
              </option>
            ))}
          </SelectField>
        ) : (
          <EmptyHint>هنوز دوره‌ای نیست — یک هفته بسازید.</EmptyHint>
        )}
        <div className="dataRowActions">
          <Button
            type="button"
            onClick={onGenerateInvoices}
            disabled={pending || !selectedPeriodId}
          >
            تولید و ارسال صورتحساب به اعضا
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClosePeriod}
            disabled={pending || !selectedPeriodId}
          >
            بستن دوره
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelPeriod}
            disabled={pending || !selectedPeriodId}
          >
            لغو دوره
          </Button>
        </div>
        <p className="liveHint">قبل از ارسال، اعضا را در لیست ببینید</p>
      </SectionCard>
      ) : periods.length > 0 ? (
        <SectionCard id="period-invoice-panel" title="دوره صورتحساب" delayClass="delay2">
          <SelectField
            label="دوره"
            value={selectedPeriodId}
            onChange={(event) => onSelectPeriodId(event.target.value)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.title} · {periodStatusLabel(period.status)}
              </option>
            ))}
          </SelectField>
        </SectionCard>
      ) : null}

      <SectionCard
        title={canManageInvoices ? "صورتحساب اعضا" : "صورتحساب من"}
        badge={invoices.length}
        delayClass="delay2"
      >
        <DataList>
          {invoices.length === 0 ? (
            <EmptyHint>
              {canManageInvoices
                ? "صورتحسابی نیست — هزینهٔ دوره را ثبت و تولید کنید."
                : "هنوز صورتحسابی برای شما ارسال نشده."}
            </EmptyHint>
          ) : null}
          {invoices.map((invoice) => {
            const isMine = session?.actor?.userId === invoice.memberUserId;
            const invoicePaymentLink = paymentLinks.find(
              (link) => link.invoiceId === invoice.id,
            );
            return (
              <DataRow
                key={invoice.id}
                title={memberLabel(invoice.memberUserId)}
                meta={
                  <>
                    <StatusPill
                      tone={
                        invoice.status === "issued" || invoice.status === "approved"
                          ? "ok"
                          : invoice.status === "disputed"
                            ? "warn"
                            : "gold"
                      }
                    >
                      {invoiceStatusLabel(invoice.status)}
                    </StatusPill>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      عمومی <Amount irrMinor={invoice.sharedTotal.amountMinor} /> · خصوصی{" "}
                      <Amount irrMinor={invoice.privateTotal.amountMinor} />
                    </span>
                    {invoice.lines.length > 0 ? (
                      <span style={{ color: "var(--muted)", fontSize: 12, display: "block" }}>
                        {invoice.lines
                          .map(
                            (line) =>
                              `${line.title} (${line.visibility === "private" ? "خصوصی" : "عمومی"})`,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </>
                }
                trailing={<Amount irrMinor={invoice.total.amountMinor} />}
                actions={
                  <>
                    {isMine && invoice.status === "pending_approval" ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onApproveInvoice(invoice.id)}
                          disabled={pending}
                        >
                          تأیید
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onDisputeInvoice(invoice.id)}
                          disabled={pending}
                        >
                          اعتراض
                        </Button>
                      </>
                    ) : null}
                    {canManageInvoices &&
                    (invoice.status === "approved" ||
                      invoice.status === "pending_approval" ||
                      invoice.status === "draft") ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onIssueInvoice(invoice.id)}
                        disabled={pending}
                      >
                        ارسال / صدور
                      </Button>
                    ) : null}
                    {invoice.status === "issued" ? (
                      <>
                        {(isMine || canManageInvoices) && invoicePaymentLink && paymentsLive ? (
                          <a
                            href={invoicePaymentLink.checkoutUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ghostLink"
                          >
                            پرداخت آنلاین
                          </a>
                        ) : (isMine || canManageInvoices) && invoicePaymentLink ? (
                          <span className="liveHint">پرداخت آنلاین منتظر PSP واقعی</span>
                        ) : null}
                        {canManageInvoices ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onMarkInvoicePaid(invoice.id)}
                            disabled={pending}
                          >
                            پرداخت شد
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </DataList>
      </SectionCard>
    </>
  );
}
