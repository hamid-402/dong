"use client";

import { MoneyInput, SelectField, TextField, Button } from "@dang/ui";
import type { DisplayUnit } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";
import { formatFaDate } from "@/lib/fa-datetime";
import { settlementStatusLabel } from "@/lib/status-labels";

export type PersonalTxnKind = "income" | "expense" | "adjustment" | "investment" | "installment";

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };
type WorkspaceOption = { id: string; name: string };
type ExpenseOption = { id: string; occurredOn: string; title: string };
type SettlementOption = { id: string; status: string };

export function PersonalTxnForm({
  displayUnit,
  accountId,
  accounts,
  kind,
  amount,
  amountError,
  accountError,
  note,
  date,
  categoryId,
  categories,
  linkWorkspaceId,
  linkWorkspaces,
  linkExpenseId,
  linkExpenses,
  linkSettlementId,
  linkSettlements,
  pending,
  onAccountIdChange,
  onKindChange,
  onAmountChange,
  onNoteChange,
  onDateChange,
  onCategoryIdChange,
  onLinkWorkspaceIdChange,
  onLinkExpenseIdChange,
  onLinkSettlementIdChange,
  onSubmit,
}: {
  displayUnit: DisplayUnit;
  accountId: string;
  accounts: AccountOption[];
  kind: PersonalTxnKind;
  amount: string;
  amountError?: string | null;
  accountError?: string | null;
  note: string;
  date: string;
  categoryId: string;
  categories: CategoryOption[];
  linkWorkspaceId: string;
  linkWorkspaces: WorkspaceOption[];
  linkExpenseId: string;
  linkExpenses: ExpenseOption[];
  linkSettlementId: string;
  linkSettlements: SettlementOption[];
  pending: boolean;
  onAccountIdChange: (value: string) => void;
  onKindChange: (value: PersonalTxnKind) => void;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onCategoryIdChange: (value: string) => void;
  onLinkWorkspaceIdChange: (value: string) => void;
  onLinkExpenseIdChange: (value: string) => void;
  onLinkSettlementIdChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div id="txn">
      <h3 className="pfSubhead">ثبت تراکنش</h3>
      <p className="flowSentence">مبلغ و شرح. حساب پیش‌فرض همان حساب فعال است و نوع، هزینه است.</p>
      <div className="pfRangeRow">
        <SelectField
          id="personal-txn-account"
          label="حساب"
          value={accountId}
          error={accountError ?? undefined}
          onChange={(event) => onAccountIdChange(event.target.value)}
        >
          <option value="">انتخاب…</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="نوع"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as PersonalTxnKind)}
        >
          <option value="expense">هزینه</option>
          <option value="income">درآمد</option>
          <option value="installment">قسط</option>
          <option value="investment">سرمایه‌گذاری</option>
          <option value="adjustment">تعدیل (افزایش)</option>
        </SelectField>
        <MoneyInput
          id="personal-txn-amount"
          label="مبلغ"
          displayUnit={displayUnit}
          value={amount}
          error={amountError ?? undefined}
          onValueChange={onAmountChange}
        />
      </div>
      <TextField
        label="شرح"
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        hint="مثلاً ناهار یا حقوق — اختیاری"
      />
      <details className="reportDetails">
        <summary>جزئیات تراکنش</summary>
        <div className="reportDetails__body">
          <JalaliDateField label="تاریخ" value={date} onChange={onDateChange} />
          <SelectField
            label="دسته"
            value={categoryId}
            onChange={(event) => onCategoryIdChange(event.target.value)}
          >
            <option value="">بدون دسته</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="لینک فضای گروهی (اختیاری)"
            value={linkWorkspaceId}
            onChange={(event) => onLinkWorkspaceIdChange(event.target.value)}
          >
            <option value="">بدون لینک</option>
            {linkWorkspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="خرج گروهی"
            value={linkExpenseId}
            onChange={(event) => onLinkExpenseIdChange(event.target.value)}
            disabled={!linkWorkspaceId}
          >
            <option value="">—</option>
            {linkExpenses.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {formatFaDate(expense.occurredOn)} · {expense.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="تسویه"
            value={linkSettlementId}
            onChange={(event) => onLinkSettlementIdChange(event.target.value)}
            disabled={!linkWorkspaceId}
          >
            <option value="">—</option>
            {linkSettlements.map((settlement) => (
              <option key={settlement.id} value={settlement.id}>
                {settlement.id.slice(0, 8)} · {settlementStatusLabel(settlement.status)}
              </option>
            ))}
          </SelectField>
        </div>
      </details>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={pending || accounts.length === 0}
      >
        ثبت تراکنش
      </Button>
    </div>
  );
}
