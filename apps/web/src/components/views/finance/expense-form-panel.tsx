"use client";

import type { CostCenterSummary, ExpensePeriodSummary, MembershipSummary, PettyCashFundSummary, SessionSummary, SplitMethod } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
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
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import type { OfflineExpenseDraft } from "@/lib/offline-drafts";

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
  fundingSourceKind?: "" | "personal" | "petty_cash";
  fundingRefId?: string;
  onFundingSourceKindChange?: (value: "" | "personal" | "petty_cash") => void;
  onFundingRefIdChange?: (value: string) => void;
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
  fundingSourceKind = "",
  fundingRefId = "",
  onFundingSourceKindChange,
  onFundingRefIdChange,
}: ExpenseFormPanelProps) {
  // Expense form progress (dong-50 #17) — derived from real form state, not fake steps.
  const amountStepDone =
    split.splitMethod === "itemized"
      ? Boolean(amountToman)
      : Boolean(tomanInputToIrrMinor(amountToman));
  const splitStepDone =
    split.visibility === "private" || split.participantUserIds.length > 0;
  const titleStepDone = Boolean(title.trim());
  const confirmStepReady = titleStepDone && amountStepDone && splitStepDone;
  const expenseStep = !amountStepDone || !titleStepDone ? 1 : !splitStepDone ? 2 : 3;
  const stepHint =
    expenseStep === 1
      ? "گام ۱: عنوان و مبلغ را مشخص کنید"
      : expenseStep === 2
        ? "گام ۲: نحوهٔ تقسیم بین اعضا را انتخاب کنید"
        : "گام ۳: ثبت کنید تا روی مانده اعمال شود";
  const draftSavedLabel = lastDraftSavedAt
    ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(lastDraftSavedAt),
      )
    : null;
  const selectedPeriodTitle = periods.find((p) => p.id === expensePeriodId)?.title;

  return (
    <SectionCard
      title={revisingExpenseId ? "اصلاح خرج (جایگزین)" : "ثبت خرج گروه (مادرخرج)"}
      delayClass="delay3"
    >
      <div id="expense-panel" />
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
      <ol className="stepper expenseStepper" aria-label="مراحل ثبت خرج">
        {(
          [
            [1, "عنوان و مبلغ", amountStepDone && titleStepDone],
            [2, "تقسیم سهم", splitStepDone && amountStepDone && titleStepDone],
            [3, "ثبت نهایی", confirmStepReady],
          ] as Array<[number, string, boolean]>
        ).map(([num, label, done], idx) => (
          <li
            key={num}
            className="expenseStepper__item"
            aria-current={expenseStep === num ? "step" : undefined}
          >
            {idx > 0 ? <span aria-hidden /> : null}
            <span className={done ? "step" : "step off"} aria-hidden>
              {num}
            </span>
            <span className="expenseStepper__label">{label}</span>
          </li>
        ))}
      </ol>
      <StatusLine>{stepHint}</StatusLine>
      <FormStack>
        <StatusLine>
          شما پرداخت می‌کنید؛ اعضا سهم مصرف را می‌بینند و بعداً از بخش تسویه تأیید/پرداخت
          می‌کنند. اگر خرج اشتباه ثبت شد، از فهرست هزینه‌ها «برگشت / اصلاح» بزنید (حذف سخت
          نیست). شارژ تنخواه/صندوق گروه از مسیر پرداخت‌هاست، نه این فرم.
        </StatusLine>
        <TextField
          label="عنوان"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          hint="مثلاً خرید هفته یا ناهار تیم"
        />
        <JalaliDateField label="تاریخ خرج" value={expenseDate} onChange={onExpenseDateChange} />
        {split.splitMethod !== "itemized" ? (
          <TextField
            label="مبلغ (تومان)"
            value={amountToman}
            onChange={(event) => onAmountTomanChange(event.target.value)}
          />
        ) : (
          <p className="liveHint">
            مبلغ کل از فاکتور آیتمی محاسبه می‌شود
            {amountToman ? ` · ${amountToman} تومان` : ""}
          </p>
        )}
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
        {costCenters.length > 0 && onCostCenterIdChange ? (
          <SelectField
            label={requireCostCenter ? "مرکز هزینه (اجباری)" : "مرکز هزینه (اختیاری)"}
            value={costCenterId}
            onChange={(event) => onCostCenterIdChange(event.target.value)}
          >
            <option value="">{requireCostCenter ? "انتخاب کنید…" : "بدون مرکز هزینه"}</option>
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
        {pettyCashFunds.length > 0 &&
        onFundingSourceKindChange &&
        onFundingRefIdChange ? (
          <>
            <SelectField
              label="منبع تأمین"
              value={
                fundingSourceKind === "petty_cash" && fundingRefId
                  ? `petty:${fundingRefId}`
                  : fundingSourceKind === "personal"
                    ? "personal"
                    : ""
              }
              onChange={(event) => {
                const v = event.target.value;
                if (v === "personal") {
                  onFundingSourceKindChange("personal");
                  onFundingRefIdChange("");
                  return;
                }
                if (v.startsWith("petty:")) {
                  onFundingSourceKindChange("petty_cash");
                  onFundingRefIdChange(v.slice("petty:".length));
                  return;
                }
                onFundingSourceKindChange("");
                onFundingRefIdChange("");
              }}
            >
              <option value="">پیش‌فرض · پرداخت شخصی عضو</option>
              <option value="personal">پرداخت شخصی (صریح)</option>
              {pettyCashFunds.map((fund) => (
                <option key={fund.id} value={`petty:${fund.id}`}>
                  تنخواه · {fund.name}
                  {fund.balanceMinor
                    ? ` · مانده ${(Number(fund.balanceMinor) / 10).toLocaleString("fa-IR")} تومان`
                    : ""}
                </option>
              ))}
            </SelectField>
            {fundingSourceKind === "petty_cash" ? (
              <p className="liveHint">
                با ثبت/تأیید خرج، مبلغ از صندوق کسر می‌شود (از capabilities و API واقعی).
              </p>
            ) : null}
          </>
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
        />
        <div className="dataRowActions">
          <Button type="button" onClick={onCreateExpense} disabled={pending}>
            {revisingExpenseId ? "ثبت اصلاح روی مانده" : "ثبت و اعمال روی مانده"}
          </Button>
          {!revisingExpenseId ? (
            <Button type="button" variant="ghost" onClick={onSaveOfflineDraft} disabled={pending}>
              ذخیره آفلاین
            </Button>
          ) : null}
        </div>
        {draftSavedLabel ? (
          <StatusLine>پیش‌نویس ذخیره شد · ساعت {draftSavedLabel}</StatusLine>
        ) : null}
      </FormStack>
      {offlineDrafts.length > 0 ? (
        <DataList>
          {offlineDrafts.map((draft) => (
            <DataRow
              key={draft.id}
              title={draft.title}
              meta={`${draft.totalToman} تومان`}
              actions={
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onSyncOfflineDraft(draft)}
                    disabled={pending}
                  >
                    همگام‌سازی
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onRemoveOfflineDraft(draft.id)}
                  >
                    حذف
                  </Button>
                </>
              }
            />
          ))}
        </DataList>
      ) : null}
    </SectionCard>
  );
}
