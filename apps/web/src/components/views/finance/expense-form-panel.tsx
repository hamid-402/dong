"use client";

import type { ExpensePeriodSummary, MembershipSummary, SessionSummary } from "@dang/contracts";
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
    <SectionCard title="ثبت خرج گروه (مادرخرج)" delayClass="delay3">
      <div id="expense-panel" />
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
          می‌کنند.
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
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.title}
              </option>
            ))}
          </SelectField>
        </details>
        <SplitComposer
          members={members}
          totalToman={amountToman}
          value={split}
          onChange={onSplitChange}
          supportsCompany={supportsCompany}
          currentUserId={session?.actor?.userId}
          canAssignPrivateToOthers={canAssignPrivateToOthers}
          onDerivedTotalToman={onAmountTomanChange}
        />
        <div className="dataRowActions">
          <Button type="button" onClick={onCreateExpense} disabled={pending}>
            ثبت و اعمال روی مانده
          </Button>
          <Button type="button" variant="ghost" onClick={onSaveOfflineDraft} disabled={pending}>
            ذخیره آفلاین
          </Button>
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
