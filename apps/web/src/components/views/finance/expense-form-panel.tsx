"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CostCenterSummary, ExpensePeriodSummary, MembershipSummary, PettyCashFundSummary, SessionSummary, SpaceKind, SplitMethod } from "@dang/contracts";
import { pettyCashAllowedForKind, treasuryLabelsForKind } from "@dang/contracts";
import { Button, MoneyInput, SelectField, TextField, useConfirm } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";
import {
  SplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  DataList,
  DataRow,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { displayInputToIrrMinor, irrMinorToDisplayInput } from "@/lib/irr-money";
import { BankSmsPaste } from "@/components/bank-sms-paste";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyUnitSuffix } from "@/lib/money-labels";
import { NAV_LABELS } from "@/lib/nav-labels";
import type { OfflineExpenseDraft } from "@/lib/offline-drafts";
import { formatMoneyFromIrrMinor } from "@dang/ui";
import { readFromLedgerFromUrl } from "@/components/views/finance/finance-url";

type ExpenseFormPanelProps = {
  title: string;
  onTitleChange: (value: string) => void;
  amountToman: string;
  onAmountTomanChange: (value: string) => void;
  expenseDate: string;
  onExpenseDateChange: (value: string) => void;
  split: SplitComposerValue;
  onSplitChange: (value: SplitComposerValue) => void;
  expensePeriodId: string;
  onExpensePeriodIdChange: (value: string) => void;
  periods: ExpensePeriodSummary[];
  members: MembershipSummary[];
  supportsCompany: boolean;
  session: SessionSummary | null;
  offlineDrafts: OfflineExpenseDraft[];
  lastDraftSavedAt: string | null;
  pending: boolean;
  onCreateExpense: () => void;
  onSaveOfflineDraft: () => void;
  onSyncOfflineDraft: (draft: OfflineExpenseDraft) => void;
  onRemoveOfflineDraft: (draftId: string) => void;
  canAssignPrivateToOthers?: boolean;
  costCenters?: CostCenterSummary[];
  costCenterId?: string;
  onCostCenterIdChange?: (value: string) => void;
  /** When workspace expense policy requires a cost center (G09 #32). */
  requireCostCenter?: boolean;
  /** Org travel/mission kind (G09 #35). */
  missionKind?: "" | "advance" | "settlement";
  onMissionKindChange?: (value: "" | "advance" | "settlement") => void;
  workspaceId?: string;
  catalogEnabled?: boolean;
  splitPresets?: Array<{
    id: string;
    name: string;
    splitMethod: SplitMethod;
    lines: Array<{ userId: string; shares?: number; percentBp?: number; amountMinor?: string }>;
  }>;
  onSaveSplitPreset?: (name: string) => void;
  savePresetPending?: boolean;
  /** Building formula split (متراژ/نفر). */
  allowFormula?: boolean;
  /** Active revise target — submit calls revise API. */
  revisingExpenseId?: string | null;
  onCancelRevise?: () => void;
  /** Live petty-cash funds when providers.pettyCash === fund_v1. */
  pettyCashFunds?: PettyCashFundSummary[];
  /** When personal — hide shared treasury / member / credit funding. */
  spaceKind?: SpaceKind;
  fundingSourceKind?: "" | "personal" | "petty_cash" | "member" | "credit";
  fundingRefId?: string;
  onFundingSourceKindChange?: (
    value: "" | "personal" | "petty_cash" | "member" | "credit",
  ) => void;
  onFundingRefIdChange?: (value: string) => void;
  /** When conversionLive — optional original FX amount (pair with originalCurrency). */
  conversionLive?: boolean;
  originalCurrency?: string;
  onOriginalCurrencyChange?: (value: string) => void;
  originalAmountMajor?: string;
  onOriginalAmountMajorChange?: (value: string) => void;
  /** Cross-link to daily ledger (clarity design). */
  ledgerHref?: string | null;
};

/**
 * Group-expense entry form with progress stepper, split composer, and offline-draft list.
 * Extracted from finance-view.tsx (dong-50 #29) — derived step state is computed from real form state.
 */
export function ExpenseFormPanel({
  title,
  onTitleChange,
  amountToman,
  onAmountTomanChange,
  expenseDate,
  onExpenseDateChange,
  split,
  onSplitChange,
  expensePeriodId,
  onExpensePeriodIdChange,
  periods,
  members,
  supportsCompany,
  session,
  offlineDrafts,
  lastDraftSavedAt,
  pending,
  onCreateExpense,
  onSaveOfflineDraft,
  onSyncOfflineDraft,
  onRemoveOfflineDraft,
  canAssignPrivateToOthers = false,
  costCenters = [],
  costCenterId = "",
  onCostCenterIdChange,
  requireCostCenter = false,
  missionKind = "",
  onMissionKindChange,
  workspaceId,
  catalogEnabled = false,
  splitPresets = [],
  onSaveSplitPreset,
  savePresetPending = false,
  allowFormula = false,
  revisingExpenseId = null,
  onCancelRevise,
  pettyCashFunds = [],
  spaceKind,
  fundingSourceKind = "",
  fundingRefId = "",
  onFundingSourceKindChange,
  onFundingRefIdChange,
  conversionLive = false,
  originalCurrency = "",
  onOriginalCurrencyChange,
  originalAmountMajor = "",
  onOriginalAmountMajorChange,
  ledgerHref = null,
}: ExpenseFormPanelProps) {
  const confirm = useConfirm();
  const displayUnit = useDisplayUnit();
  const [titleError, setTitleError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [fromLedger, setFromLedger] = useState(false);
  useEffect(() => {
    setFromLedger(readFromLedgerFromUrl());
  }, []);
  const unitLabel = moneyUnitSuffix(displayUnit);
  const showSharedFunding =
    Boolean(spaceKind == null || pettyCashAllowedForKind(spaceKind)) &&
    (pettyCashFunds.length > 0 || members.length > 0) &&
    Boolean(onFundingSourceKindChange && onFundingRefIdChange);
  const treasuryLabels = treasuryLabelsForKind(spaceKind ?? "group");
  const draftSavedLabel = lastDraftSavedAt
    ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(lastDraftSavedAt),
      )
    : null;
  const selectedPeriodTitle = periods.find((p) => p.id === expensePeriodId)?.title;
  const draftSelection = useRowSelection(offlineDrafts.map((d) => d.id));
  const barDraft =
    draftSelection.selectedCount === 1
      ? (offlineDrafts.find((d) => d.id === draftSelection.selectedIds[0]) ?? null)
      : null;

  function submitExpense() {
    const missingTitle = !title.trim();
    const missingAmount =
      split.splitMethod !== "itemized" && !displayInputToIrrMinor(amountToman, displayUnit);
    setTitleError(missingTitle ? "شرح را وارد کنید" : null);
    setAmountError(missingAmount ? `مبلغ معتبر وارد کنید (${unitLabel})` : null);
    if (missingTitle) {
      document.getElementById("expense-title")?.focus();
      return;
    }
    if (missingAmount) {
      document.getElementById("expense-amount")?.focus();
      return;
    }
    onCreateExpense();
  }

  return (
    <SectionCard
      title={
        revisingExpenseId
          ? "اصلاح خرج (جایگزین)"
          : spaceKind === "org"
            ? `${NAV_LABELS.fullExpense} (مادرخرج)`
            : spaceKind === "building"
              ? `${NAV_LABELS.fullExpense} / شارژ`
              : NAV_LABELS.fullExpense
      }
      delayClass="delay1"
    >
      <div id="expense-panel" />
      {fromLedger && ledgerHref ? (
        <StatusLine>
          برگشت از {NAV_LABELS.dailyEntry} —{" "}
          <Link href={ledgerHref}>بازگشت به ثبت روزانه</Link>
        </StatusLine>
      ) : null}
      {ledgerHref && spaceKind !== "personal" && !revisingExpenseId ? (
        <StatusLine>
          مصرف تکراری روزمره؟{" "}
          <Link href={ledgerHref}>{NAV_LABELS.dailyEntry}</Link> برای تیک
          روز×عضو سریع‌تر است.
        </StatusLine>
      ) : null}
      {revisingExpenseId ? (
        <StatusLine>
          در حال اصلاح خرج قبلی — با ثبت، نسخهٔ قدیمی برگشت می‌خورد و این نسخه جایگزین
          می‌شود.{" "}
          {onCancelRevise ? (
            <button type="button" className="textButton" onClick={onCancelRevise}>
              انصراف از اصلاح
            </button>
          ) : null}
        </StatusLine>
      ) : null}
      <FormStack className="expenseFormWide">
        <p className="flowSentence">
          مبلغ، شرح، و کسی که پرداخت کرده. سهم بقیه مساوی است مگر جزئیات را باز کنید.
        </p>
        <TextField
          id="expense-title"
          label="شرح"
          value={title}
          onChange={(event) => {
            setTitleError(null);
            onTitleChange(event.target.value);
          }}
          hint="مثلاً خرید هفته یا ناهار"
          error={titleError ?? undefined}
          required
        />
        {split.splitMethod !== "itemized" ? (
          <MoneyInput
            id="expense-amount"
            label="مبلغ"
            displayUnit={displayUnit}
            value={amountToman}
            onValueChange={(next) => {
              setAmountError(null);
              onAmountTomanChange(next);
            }}
            error={amountError ?? undefined}
          />
        ) : (
          <p className="liveHint">
            مبلغ کل از فاکتور آیتمی محاسبه می‌شود
            {amountToman ? ` · ${amountToman} ${unitLabel}` : ""}
          </p>
        )}
        {requireCostCenter && costCenters.length > 0 && onCostCenterIdChange ? (
          <SelectField
            label="مرکز هزینه (اجباری)"
            value={costCenterId}
            onChange={(event) => onCostCenterIdChange(event.target.value)}
          >
            <option value="">انتخاب کنید…</option>
            {costCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
                {center.code ? ` · ${center.code}` : ""}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SplitComposer
          members={members}
          totalToman={amountToman}
          value={split}
          onChange={onSplitChange}
          supportsCompany={supportsCompany}
          currentUserId={session?.actor?.userId}
          canAssignPrivateToOthers={canAssignPrivateToOthers}
          onDerivedTotalToman={onAmountTomanChange}
          workspaceId={workspaceId}
          catalogEnabled={catalogEnabled}
          splitPresets={splitPresets}
          onSavePreset={onSaveSplitPreset}
          savePresetPending={savePresetPending}
          allowFormula={allowFormula}
          compact={!revisingExpenseId}
        />
        <details className="reportDetails" open={revisingExpenseId ? true : undefined}>
          <summary>جزئیات خرج</summary>
          <div className="reportDetails__body">
        <JalaliDateField label="تاریخ خرج" value={expenseDate} onChange={onExpenseDateChange} />
        {split.splitMethod !== "itemized" ? (
          <BankSmsPaste
            onApply={(parsed) => {
              if (!parsed.amountMinor) return;
              onAmountTomanChange(irrMinorToDisplayInput(parsed.amountMinor, displayUnit));
              if (!title.trim()) {
                const bits = [
                  parsed.direction === "deposit"
                    ? "واریز"
                    : parsed.direction === "withdrawal"
                      ? "برداشت"
                      : parsed.direction === "purchase"
                        ? "خرید"
                        : "پیامک بانک",
                  parsed.bankName,
                  parsed.trackingCode ? `پیگیری ${parsed.trackingCode}` : "",
                ].filter(Boolean);
                onTitleChange(bits.join(" · "));
              }
              if (parsed.isoDate) onExpenseDateChange(parsed.isoDate);
            }}
          />
        ) : null}
        {conversionLive &&
        onOriginalCurrencyChange &&
        onOriginalAmountMajorChange &&
        split.splitMethod !== "itemized" ? (
          <details className="reportDetails">
            <summary>
              ارز مبدأ (اختیاری)
              {originalCurrency.trim()
                ? ` · ${originalCurrency.trim().toUpperCase()}`
                : ""}
            </summary>
            <StatusLine>
              با نرخ زنده جدول FX، مبلغ IRR از ارز مبدأ محاسبه و با دفترکل هم‌خوان می‌شود.
            </StatusLine>
            <TextField
              label="کد ارز (ISO)"
              value={originalCurrency}
              onChange={(event) => onOriginalCurrencyChange(event.target.value)}
              hint="مثلاً USD یا EUR — خالی = فقط واحد نمایش پروفایل"
            />
            <TextField
              label="مبلغ به ارز مبدأ"
              value={originalAmountMajor}
              onChange={(event) => onOriginalAmountMajorChange(event.target.value)}
              hint="واحد اصلی ارز (مثلاً ۱۰.۵ دلار)"
            />
          </details>
        ) : null}
        <details className="reportDetails">
          <summary>
            دوره (اختیاری)
            {selectedPeriodTitle ? ` · ${selectedPeriodTitle}` : ""}
          </summary>
          <SelectField
            label="دوره"
            value={expensePeriodId}
            onChange={(event) => onExpensePeriodIdChange(event.target.value)}
          >
            <option value="">بدون دوره</option>
            {periods.map((period) => {
              // Closed books refuse postings server-side, so the option must not
              // look available here either.
              const shut = period.status !== "open" && period.status !== "review";
              return (
                <option key={period.id} value={period.id} disabled={shut}>
                  {period.title}
                  {shut ? " (بسته)" : ""}
                </option>
              );
            })}
          </SelectField>
        </details>
        {costCenters.length > 0 && onCostCenterIdChange && !requireCostCenter ? (
          <SelectField
            label="مرکز هزینه (اختیاری)"
            value={costCenterId}
            onChange={(event) => onCostCenterIdChange(event.target.value)}
          >
            <option value="">بدون مرکز هزینه</option>
            {costCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
                {center.code ? ` · ${center.code}` : ""}
              </option>
            ))}
          </SelectField>
        ) : null}
        {onMissionKindChange ? (
          <SelectField
            label="مأموریت / سفر (اختیاری)"
            value={missionKind}
            onChange={(event) =>
              onMissionKindChange(event.target.value as "" | "advance" | "settlement")
            }
          >
            <option value="">بدون مأموریت</option>
            <option value="advance">پیش‌پرداخت مأموریت</option>
            <option value="settlement">تسویه مأموریت</option>
          </SelectField>
        ) : null}
        {showSharedFunding ? (
          <>
            <SelectField
              label="از کجا پرداخت شد؟"
              value={
                fundingSourceKind === "petty_cash" && fundingRefId
                  ? `petty:${fundingRefId}`
                  : fundingSourceKind === "member" && fundingRefId
                    ? `member:${fundingRefId}`
                    : fundingSourceKind === "personal"
                      ? "personal"
                      : fundingSourceKind === "credit"
                        ? "credit"
                        : ""
              }
              onChange={(event) => {
                const v = event.target.value;
                if (v === "personal") {
                  onFundingSourceKindChange!("personal");
                  onFundingRefIdChange!("");
                  return;
                }
                if (v === "credit") {
                  onFundingSourceKindChange!("credit");
                  onFundingRefIdChange!("");
                  return;
                }
                if (v.startsWith("petty:")) {
                  onFundingSourceKindChange!("petty_cash");
                  onFundingRefIdChange!(v.slice("petty:".length));
                  return;
                }
                if (v.startsWith("member:")) {
                  onFundingSourceKindChange!("member");
                  onFundingRefIdChange!(v.slice("member:".length));
                  return;
                }
                onFundingSourceKindChange!("");
                onFundingRefIdChange!("");
              }}
            >
              <option value="">پیش‌فرض · پرداخت شخصی ثبت‌کننده</option>
              <option value="personal">حساب شخصی پرداخت‌کننده</option>
              {pettyCashFunds.map((fund) => (
                <option key={fund.id} value={`petty:${fund.id}`}>
                  {treasuryLabels.pettyCash} · {fund.name}
                  {fund.balanceMinor
                    ? ` · مانده ${formatMoneyFromIrrMinor(fund.balanceMinor, displayUnit)} ${unitLabel}`
                    : ""}
                </option>
              ))}
              {members.map((m) => (
                <option key={`m-${m.userId}`} value={`member:${m.userId}`}>
                  حساب شخصی عضو · {m.displayName}
                </option>
              ))}
              <option value="credit">خرید اعتباری / قسطی (پرداخت بعدی)</option>
            </SelectField>
            {fundingSourceKind === "petty_cash" ? (
              <p className="liveHint">
                با ثبت/تأیید خرج، مبلغ از {treasuryLabels.pettyCash} کسر می‌شود (مانده
                زنده). نگهبان صندوق معمولاً {treasuryLabels.financeRole} یا{" "}
                {treasuryLabels.deputy} است.
              </p>
            ) : null}
            {fundingSourceKind === "member" ? (
              <p className="liveHint">
                پرداخت‌کننده روی همان عضو تنظیم می‌شود — بستانکار همان عضو خواهد بود.
              </p>
            ) : null}
            {fundingSourceKind === "credit" ? (
              <p className="liveHint">
                با ثبت/تأیید خرج، خرید اعتباری باز با سررسید ۳۰روزه ساخته می‌شود؛ اقساط
                بعدی از مسیر پرداخت‌ها.
              </p>
            ) : null}
          </>
        ) : null}
          </div>
        </details>
        <div className="expenseFormActions">
          <Button type="button" onClick={submitExpense} disabled={pending}>
            {revisingExpenseId ? "ثبت اصلاح روی مانده" : "ثبت خرج"}
          </Button>
          {!revisingExpenseId ? (
            <Button type="button" variant="secondary" onClick={onSaveOfflineDraft} disabled={pending}>
              ذخیره آفلاین
            </Button>
          ) : null}
        </div>
        {draftSavedLabel ? (
          <StatusLine>پیش‌نویس ذخیره شد · ساعت {draftSavedLabel}</StatusLine>
        ) : null}
      </FormStack>
      {offlineDrafts.length > 0 ? (
        <details className="reportDetails">
          <summary>
            پیش‌نویس آفلاین
            {` · ${offlineDrafts.length.toLocaleString("fa-IR")}`}
          </summary>
          <div className="reportDetails__body">
          <SelectionActionBar
            selectedCount={draftSelection.selectedCount}
            idleHint="روی ردیف کلیک کنید یا مربع کنار پیش‌نویس را تیک بزنید"
            onClear={draftSelection.clear}
          >
            {barDraft ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  onSyncOfflineDraft(barDraft);
                  draftSelection.clear();
                }}
              >
                همگام‌سازی
              </Button>
            ) : null}
            <Button
              type="button"
              variant="danger"
              disabled={draftSelection.selectedCount === 0}
              onClick={() => {
                const ids = draftSelection.selectedIds;
                const label =
                  ids.length === 1
                    ? "این پیش‌نویس حذف شود؟"
                    : `${ids.length.toLocaleString("fa-IR")} پیش‌نویس حذف شوند؟`;
                void confirm(label).then((accepted) => {
                  if (!accepted) return;
                  for (const id of ids) onRemoveOfflineDraft(id);
                  draftSelection.clear();
                });
              }}
            >
              حذف
            </Button>
          </SelectionActionBar>
          <DataList>
            {offlineDrafts.map((draft) => (
              <div
                key={draft.id}
                className={selStyles.selectableRow}
                {...rowSelectActivateProps({
                  onActivate: () => draftSelection.toggle(draft.id),
                })}
              >
                <DataRow
                  title={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <RowSelectCheckbox
                        checked={draftSelection.isSelected(draft.id)}
                        onChange={() => draftSelection.toggle(draft.id)}
                        label={`انتخاب پیش‌نویس ${draft.title}`}
                      />
                      {draft.title}
                    </span>
                  }
                  meta={`${draft.totalToman} ${unitLabel}`}
                />
              </div>
            ))}
          </DataList>
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}
