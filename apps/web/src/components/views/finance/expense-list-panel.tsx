"use client";

import type { ExpenseSummary, ExpenseVisibility } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyStateBlock,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { ExpenseReceiptUpload } from "@/components/expense-receipt-upload";
import { expenseStatusLabel, expenseVisibilityLabel } from "@/lib/status-labels";

type ExpenseFilter = "all" | ExpenseVisibility;

type ExpenseListPanelProps = {
  filteredExpenses: ExpenseSummary[];
  expenseFilter: ExpenseFilter;
  onFilterChange: (filter: ExpenseFilter) => void;
  supportsCompany: boolean;
  canApproveCompany: boolean;
  selectedId: string;
  pending: boolean;
  /** When false, show short copy that API already scopes private expenses. */
  canManageFinance?: boolean;
  /** Auditor/guest — no submit/post/promote/receipt upload. */
  readOnly?: boolean;
  onSubmitExpense: (expenseId: string) => void;
  onPostExpense: (expenseId: string) => void;
  onPromoteCompany: (expenseId: string) => void;
};

/**
 * Recent-expenses card with visibility filter tabs and per-row lifecycle actions.
 * Extracted from finance-view.tsx (dong-50 #29) — presentational, driven by parent state.
 */
export function ExpenseListPanel({
  filteredExpenses,
  expenseFilter,
  onFilterChange,
  supportsCompany,
  canApproveCompany,
  selectedId,
  pending,
  canManageFinance = false,
  readOnly = false,
  onSubmitExpense,
  onPostExpense,
  onPromoteCompany,
}: ExpenseListPanelProps) {
  return (
    <SectionCard title="هزینه‌های اخیر" badge={filteredExpenses.length} delayClass="delay2">
      <div className="expenseFilterRow" role="tablist" aria-label="فیلتر نوع خرج">
        {(
          [
            ["all", "همه"],
            ["shared", "جمعی"],
            ["private", "خصوصی"],
            ...(supportsCompany ? [["company", "شرکتی"] as const] : []),
          ] as Array<[ExpenseFilter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={expenseFilter === key}
            className={expenseFilter === key ? "expenseFilter active" : "expenseFilter"}
            onClick={() => onFilterChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {!canManageFinance ? (
        <p className="liveHint">
          پیش‌فرض «همه» است — جمعی‌های گروه به‌علاوه خرج خصوصی خودتان؛ خصوصی دیگران را نمی‌بینید.
        </p>
      ) : null}
      <DataList>
        {filteredExpenses.length === 0 ? (
          <EmptyStateBlock
            title={
              expenseFilter === "all"
                ? "هنوز هزینه‌ای ثبت نشده"
                : "در این دسته هزینه‌ای نیست"
            }
            description="اولین خرج گروه را ثبت کنید تا سهم اعضا روی مانده اعمال شود."
            action={
              <Button
                type="button"
                onClick={() =>
                  document
                    .getElementById("expense-panel")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                ثبت خرج گروه
              </Button>
            }
          />
        ) : null}
        {filteredExpenses.slice(0, 5).map((expense) => (
          <DataRow
            key={expense.id}
            title={expense.title}
            meta={
              <>
                <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>
                  {expenseStatusLabel(expense.status)}
                </StatusPill>
                <StatusPill
                  tone={
                    expense.visibility === "private"
                      ? "warn"
                      : expense.visibility === "company"
                        ? "gold"
                        : "ok"
                  }
                >
                  {expenseVisibilityLabel(expense.visibility)}
                </StatusPill>
              </>
            }
            trailing={<Amount irrMinor={expense.total.amountMinor} />}
            actions={
              readOnly ? null : (
                <>
                  {expense.status === "draft" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onSubmitExpense(expense.id)}
                      disabled={pending}
                    >
                      ارسال
                    </Button>
                  ) : null}
                  {expense.status === "draft" || expense.status === "submitted" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onPostExpense(expense.id)}
                      disabled={pending}
                    >
                      ثبت در دفترکل
                    </Button>
                  ) : null}
                  {supportsCompany &&
                  canApproveCompany &&
                  expense.visibility === "private" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onPromoteCompany(expense.id)}
                      disabled={pending}
                    >
                      تأیید شرکتی
                    </Button>
                  ) : null}
                  {selectedId ? (
                    <ExpenseReceiptUpload
                      workspaceId={selectedId}
                      expenseId={expense.id}
                    />
                  ) : null}
                </>
              )
            }
          />
        ))}
      </DataList>
    </SectionCard>
  );
}
