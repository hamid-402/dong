"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ExpensePeriodSummary,
  FundingSourceKind,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  PaymentLinkSummary,
  PeriodKind,
  SessionSummary,
} from "@dang/contracts";
import { fundingSourceKindLabelFa, isInvoiceLocked } from "@dang/contracts";
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
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import { formatFaDate } from "@/lib/fa-datetime";
import { invoiceStatusLabel, periodKindLabel, periodStatusLabel } from "@/lib/status-labels";
import { memberStatementHref } from "@/lib/statement-links";
import { NAV_LABELS } from "@/lib/nav-labels";
import styles from "./period-invoice-panels.module.css";
import selStyles from "@/components/selection/selection-action-bar.module.css";

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
  /** Correction notices for invoices already issued in this period. */
  invoiceAdjustments?: MemberInvoiceAdjustmentSummary[];
  paymentLinks: PaymentLinkSummary[];
  paymentsLive: boolean;
  pending: boolean;
  session: SessionSummary | null;
  memberLabel: (userId: string) => string;
  /** Workspace slug for share-based statement deep links. */
  slug?: string | null;
  onCreatePeriod: () => void;
  onGenerateInvoices: () => void;
  onClosePeriod: () => void;
  onCancelPeriod: () => void;
  onApproveInvoice: (invoiceId: string) => void;
  onDisputeInvoice: (invoiceId: string) => void;
  /** Finance answers an objection: accepted → back to draft, rejected → issued. */
  onResolveInvoiceDispute: (
    invoiceId: string,
    outcome: "accepted" | "rejected",
  ) => void;
  onIssueInvoice: (invoiceId: string) => void;
  onMarkInvoicePaid: (invoiceId: string) => void;
  /** مادرخرج / مدیر مالی — ساخت دوره، تولید و صدور صورتحساب */
  canManageInvoices?: boolean;
  /**
   * What the server reports about invoice automation (`/system/capabilities`).
   * Absent = the API did not say, so the card claims nothing.
   */
  automation?: {
    mode: "live_invoice_sweep_v1" | "live_invoice_v1";
    reconcile?: "off" | "expense_invoice_v1" | "expense_ledger_invoice_v1";
  } | null;
  /**
   * Live funding source per expense id (from workspace expenses) — shown in
   * the inspector so members see تنخواه vs جیب شخصی without a schema change.
   */
  expenseFundingById?: Readonly<
    Record<string, FundingSourceKind | undefined>
  >;
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
  invoiceAdjustments = [],
  paymentLinks,
  paymentsLive,
  pending,
  session,
  memberLabel,
  slug,
  automation = null,
  onCreatePeriod,
  onGenerateInvoices,
  onClosePeriod,
  onCancelPeriod,
  onApproveInvoice,
  onDisputeInvoice,
  onResolveInvoiceDispute,
  onIssueInvoice,
  onMarkInvoicePaid,
  canManageInvoices = false,
  expenseFundingById,
}: PeriodInvoicePanelsProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const selection = useRowSelection(invoices.map((i) => i.id));
  const selectedInvoice =
    invoices.find((invoice) => invoice.id === selectedInvoiceId) ??
    invoices[0] ??
    null;
  const barInvoice =
    selection.selectedCount === 1
      ? (invoices.find((i) => i.id === selection.selectedIds[0]) ?? null)
      : null;
  const selectedAdjustments = selectedInvoice
    ? invoiceAdjustments.filter(
        (adjustment) => adjustment.invoiceId === selectedInvoice.id,
      )
    : [];
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  // Costs whose real spend date falls before this period began: they reached the
  // books after their own month was closed, and the document must say so.
  const priorPeriodLines =
    selectedInvoice && selectedPeriod?.startsOn
      ? selectedInvoice.lines.filter(
          (line) => line.occurredOn != null && line.occurredOn < selectedPeriod.startsOn,
        )
      : [];
  const priorPeriodMinor = priorPeriodLines
    .reduce((sum, line) => sum + BigInt(line.amount.amountMinor), 0n)
    .toString();
  const statementRange =
    selectedPeriod?.startsOn && selectedPeriod?.endsOn
      ? { from: selectedPeriod.startsOn, to: selectedPeriod.endsOn }
      : undefined;

  useEffect(() => {
    if (
      selectedInvoiceId &&
      !invoices.some((invoice) => invoice.id === selectedInvoiceId)
    ) {
      setSelectedInvoiceId(invoices[0]?.id ?? "");
    }
  }, [invoices, selectedInvoiceId]);

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
                {period.title} · {periodKindLabel(period.kind)} · {periodStatusLabel(period.status)}
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
        title={canManageInvoices ? "صورتحساب دوره‌ای اعضا" : "صورتحساب دوره‌ای من"}
        badge={invoices.length}
        delayClass="delay2"
      >
        {automation ? (
          <p className="liveHint">
            {automation.mode === "live_invoice_sweep_v1"
              ? "هر خرج ثبت‌شده همین لحظه در پیش‌نویس سند اعضا می‌نشیند؛ دوره‌ها هم خودکار تمدید و مغایرت‌یابی می‌شوند."
              : "هر خرج ثبت‌شده همین لحظه در پیش‌نویس سند اعضا می‌نشیند؛ تمدید دوره و مغایرت‌یابی با اجرای کار پس‌زمینه انجام می‌شود."}
            {automation.reconcile === "expense_ledger_invoice_v1"
              ? " مغایرت‌یابی، خرج‌ها را با دفتر و سند مقایسه می‌کند."
              : automation.reconcile === "expense_invoice_v1"
                ? " مغایرت‌یابی فقط خرج‌ها را با سند مقایسه می‌کند (دفتر در دسترس نیست)."
                : ""}
          </p>
        ) : null}
        <div className={styles.masterDetail}>
        <div>
        {invoices.length > 0 ? (
          <SelectionActionBar
            selectedCount={selection.selectedCount}
            idleHint="روی ردیف کلیک کنید یا مربع کنار صورتحساب را تیک بزنید"
            onClear={selection.clear}
          >
            <button
              type="button"
              disabled={!barInvoice}
              onClick={() => barInvoice && setSelectedInvoiceId(barInvoice.id)}
            >
              جزئیات
            </button>
            {barInvoice && slug ? (
              <Link
                className="textButton"
                href={memberStatementHref(
                  slug,
                  barInvoice.memberUserId,
                  statementRange,
                )}
              >
                {NAV_LABELS.statements}
              </Link>
            ) : null}
            {barInvoice &&
            session?.actor?.userId === barInvoice.memberUserId &&
            barInvoice.status === "pending_approval" ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onApproveInvoice(barInvoice.id);
                    selection.clear();
                  }}
                >
                  تأیید
                </button>
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={pending}
                  onClick={() => {
                    onDisputeInvoice(barInvoice.id);
                    selection.clear();
                  }}
                >
                  اعتراض
                </button>
              </>
            ) : null}
            {barInvoice &&
            canManageInvoices &&
            barInvoice.status === "disputed" ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onResolveInvoiceDispute(barInvoice.id, "accepted");
                    selection.clear();
                  }}
                >
                  پذیرش اعتراض
                </button>
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={pending}
                  onClick={() => {
                    onResolveInvoiceDispute(barInvoice.id, "rejected");
                    selection.clear();
                  }}
                >
                  رد اعتراض
                </button>
              </>
            ) : null}
            {barInvoice &&
            canManageInvoices &&
            (barInvoice.status === "approved" ||
              barInvoice.status === "pending_approval" ||
              barInvoice.status === "draft") ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  onIssueInvoice(barInvoice.id);
                  selection.clear();
                }}
              >
                ارسال / صدور
              </button>
            ) : null}
            {barInvoice && barInvoice.status === "issued"
              ? (() => {
                  const isMine =
                    session?.actor?.userId === barInvoice.memberUserId;
                  const invoicePaymentLink = paymentLinks.find(
                    (link) => link.invoiceId === barInvoice.id,
                  );
                  return (
                    <>
                      {(isMine || canManageInvoices) &&
                      invoicePaymentLink &&
                      paymentsLive ? (
                        <a
                          href={invoicePaymentLink.checkoutUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          پرداخت آنلاین
                        </a>
                      ) : (isMine || canManageInvoices) && invoicePaymentLink ? (
                        <span className="liveHint">پرداخت آنلاین منتظر PSP واقعی</span>
                      ) : null}
                      {canManageInvoices ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            onMarkInvoicePaid(barInvoice.id);
                            selection.clear();
                          }}
                        >
                          پرداخت شد
                        </button>
                      ) : null}
                    </>
                  );
                })()
              : null}
          </SelectionActionBar>
        ) : null}
        <DataList>
          {invoices.length === 0 ? (
            <EmptyHint>
              {canManageInvoices
                ? "صورتحسابی نیست — هزینهٔ دوره را ثبت و تولید کنید."
                : "هنوز صورتحسابی برای شما ارسال نشده."}
            </EmptyHint>
          ) : null}
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className={selStyles.selectableRow}
              {...rowSelectActivateProps({
                onActivate: () => {
                  if (selection.isSelected(invoice.id)) selection.clear();
                  else {
                    selection.selectOnly(invoice.id);
                    setSelectedInvoiceId(invoice.id);
                  }
                },
              })}
            >
            <DataRow
              title={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <RowSelectCheckbox
                    checked={selection.isSelected(invoice.id)}
                    onChange={() => {
                      if (selection.isSelected(invoice.id)) selection.clear();
                      else {
                        selection.selectOnly(invoice.id);
                        setSelectedInvoiceId(invoice.id);
                      }
                    }}
                    label={`انتخاب صورتحساب ${memberLabel(invoice.memberUserId)}`}
                  />
                  {memberLabel(invoice.memberUserId)}
                </span>
              }
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
                  {isInvoiceLocked(invoice.status) ? (
                    <span style={{ color: "var(--muted)", fontSize: 12, display: "block" }}>
                      سند قفل‌شده — تغییرات بعدی به‌صورت اعلامیهٔ اصلاحی ثبت می‌شود
                    </span>
                  ) : invoice.recalculatedAt ? (
                    <span style={{ color: "var(--muted)", fontSize: 12, display: "block" }}>
                      پیش‌نویس زنده · آخرین به‌روزرسانی {formatFaDate(invoice.recalculatedAt)}
                      {invoice.version ? ` · نسخهٔ ${invoice.version}` : ""}
                    </span>
                  ) : null}
                  {invoice.pendingTotal &&
                  invoice.pendingTotal.amountMinor !== "0" ? (
                    <span style={{ color: "var(--muted)", fontSize: 12, display: "block" }}>
                      در انتظار ثبت نهایی (خارج از جمع سند){" "}
                      <Amount irrMinor={invoice.pendingTotal.amountMinor} />
                    </span>
                  ) : null}
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
            />
            </div>
          ))}
        </DataList>
        </div>
        {selectedInvoice ? (
            <aside className={styles.inspector} aria-label="جزئیات صورتحساب انتخاب‌شده">
            <span>جزئیات صورتحساب</span>
            <h3>{memberLabel(selectedInvoice.memberUserId)}</h3>
            <Amount irrMinor={selectedInvoice.total.amountMinor} />
            <dl>
              <div><dt>وضعیت</dt><dd>{invoiceStatusLabel(selectedInvoice.status)}</dd></div>
              <div><dt>عمومی</dt><dd><Amount irrMinor={selectedInvoice.sharedTotal.amountMinor} /></dd></div>
              <div><dt>خصوصی</dt><dd><Amount irrMinor={selectedInvoice.privateTotal.amountMinor} /></dd></div>
              <div><dt>تعداد ردیف</dt><dd>{selectedInvoice.lines.length}</dd></div>
              <div><dt>صدور</dt><dd>{selectedInvoice.issuedAt ? formatFaDate(selectedInvoice.issuedAt) : "هنوز صادر نشده"}</dd></div>
              <div><dt>پرداخت</dt><dd>{selectedInvoice.paidAt ? formatFaDate(selectedInvoice.paidAt) : "ثبت نشده"}</dd></div>
              <div>
                <dt>بازمحاسبه</dt>
                <dd>
                  {selectedInvoice.recalculatedAt
                    ? formatFaDate(selectedInvoice.recalculatedAt)
                    : "با تولید دستی ساخته شده"}
                </dd>
              </div>
            </dl>
            {selectedInvoice.lines.length > 0 ? (
              <div>
                <b>ردیف‌ها و منبع پرداخت</b>
                <ul className={styles.fundingList}>
                  {selectedInvoice.lines.map((line) => {
                    const funding = expenseFundingById?.[line.expenseId];
                    const fundingLabel =
                      funding != null
                        ? fundingSourceKindLabelFa(funding)
                        : null;
                    return (
                      <li key={line.id}>
                        <span>
                          {line.title} ·{" "}
                          <Amount irrMinor={line.amount.amountMinor} />
                        </span>
                        {fundingLabel ? (
                          <span className={styles.fundingList__meta}>
                            منبع: {fundingLabel}
                            {line.visibility === "private" ? " · خصوصی" : " · عمومی"}
                          </span>
                        ) : (
                          <span className={styles.fundingList__meta}>
                            {line.visibility === "private" ? "خصوصی" : "عمومی"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {selectedInvoice.lines.some((line) => {
                  const f = expenseFundingById?.[line.expenseId];
                  return f === "petty_cash" || f === "personal";
                }) ? (
                  <div className={styles.fundingHint}>
                    بدهی/بستانکاری نسبت به تنخواه در مانده و پیشنهاد تسویه دیده
                    می‌شود؛ شرح کامل در صورتحساب سهم‌محور (چاپ و Excel).
                  </div>
                ) : null}
              </div>
            ) : null}
            {priorPeriodLines.length > 0 ? (
              <div>
                <b>اقلام دوره‌های گذشته</b>
                <p className="liveHint">
                  این مبالغ در ماه خودشان ثبت نشده‌اند و پس از بستن آن دوره به این
                  سند رسیده‌اند · <Amount irrMinor={priorPeriodMinor} />
                </p>
                <ul>
                  {priorPeriodLines.map((line) => (
                    <li key={line.id}>
                      {line.title} · {formatFaDate(line.occurredOn)} ·{" "}
                      <Amount irrMinor={line.amount.amountMinor} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedAdjustments.length > 0 ? (
              <div>
                <b>اعلامیه‌های اصلاحی</b>
                <ul>
                  {selectedAdjustments.map((adjustment) => (
                    <li key={adjustment.id}>
                      <Amount irrMinor={adjustment.delta.amountMinor} /> ·{" "}
                      {formatFaDate(adjustment.createdAt)} · {adjustment.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedInvoice.disputeNote ? (
              <p><b>یادداشت اختلاف</b>{selectedInvoice.disputeNote}</p>
            ) : null}
            {slug ? (
              <p className="liveHint">
                <Link
                  href={memberStatementHref(
                    slug,
                    selectedInvoice.memberUserId,
                    statementRange,
                  )}
                >
                  باز کردن {NAV_LABELS.statements} (سهم‌محور)
                </Link>
              </p>
            ) : null}
          </aside>
        ) : null}
        </div>
      </SectionCard>
    </>
  );
}
