"use client";

import { useEffect, useState } from "react";
import type { ExpenseSummary, ExpenseVisibility } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyStateBlock,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { EmptyStateIllustration } from "@/components/ui/empty-state-illustration";
import { ExpenseReceiptUpload } from "@/components/expense-receipt-upload";
import { ExpenseCommentsPanel } from "@/components/expense-comments-panel";
import { JalaliDateField } from "@/components/jalali-date-field";
import { formatFaDate } from "@/lib/fa-datetime";
import { t } from "@/lib/i18n";
import { expenseStatusLabel, expenseVisibilityLabel } from "@/lib/status-labels";
import { ReverseExpenseDialog } from "@/components/views/finance/reverse-expense-dialog";
import styles from "./expense-list-panel.module.css";

type ExpenseFilter = "all" | ExpenseVisibility;

type ExpenseListPanelProps = {
  filteredExpenses: ExpenseSummary[];
  expenseFilter: ExpenseFilter;
  onFilterChange: (filter: ExpenseFilter) => void;
  expenseFrom?: string;
  expenseTo?: string;
  onExpenseFromChange?: (value: string) => void;
  onExpenseToChange?: (value: string) => void;
  catalogItemId?: string;
  catalogOptions?: Array<{ id: string; name: string }>;
  onCatalogItemIdChange?: (value: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  paidByUserId?: string;
  onPaidByUserIdChange?: (value: string) => void;
  payerOptions?: Array<{ id: string; name: string }>;
  categoryId?: string;
  onCategoryIdChange?: (value: string) => void;
  categoryOptions?: Array<{ id: string; name: string }>;
  tagId?: string;
  onTagIdChange?: (value: string) => void;
  tagOptions?: Array<{ id: string; name: string }>;
  /** Honest OCR provider mode from capabilities. */
  ocrMode?: "stub" | "configured";
  onApplyOcr?: (hints: { title?: string; amountToman?: string }) => void;
  supportsCompany: boolean;
  canApproveCompany: boolean;
  selectedId: string;
  pending: boolean;
  /** When false, show short copy that API already scopes private expenses. */
  canManageFinance?: boolean;
  /** Auditor/guest — no submit/post/promote/receipt upload. */
  readOnly?: boolean;
  memberLabel: (userId: string) => string;
  /** Deep-link: open inspector for this expense id when present in the list. */
  initialExpenseId?: string;
  onSubmitExpense: (expenseId: string) => void;
  onPostExpense: (expenseId: string) => void;
  onPromoteCompany: (expenseId: string) => void;
  onReverseExpense?: (expenseId: string, reason: string) => void;
  /** Prefill create form; submit will call revise (reverse+recreate). */
  onBeginReviseExpense?: (expenseId: string, reason: string) => void;
};

/**
 * Recent-expenses card with visibility filter tabs and per-row lifecycle actions.
 * Extracted from finance-view.tsx (dong-50 #29) — presentational, driven by parent state.
 */
export function ExpenseListPanel({
  filteredExpenses,
  expenseFilter,
  onFilterChange,
  expenseFrom = "",
  expenseTo = "",
  onExpenseFromChange,
  onExpenseToChange,
  catalogItemId = "",
  catalogOptions = [],
  onCatalogItemIdChange,
  searchQuery = "",
  onSearchQueryChange,
  paidByUserId = "",
  onPaidByUserIdChange,
  payerOptions = [],
  categoryId = "",
  onCategoryIdChange,
  categoryOptions = [],
  tagId = "",
  onTagIdChange,
  tagOptions = [],
  ocrMode,
  onApplyOcr,
  supportsCompany,
  canApproveCompany,
  selectedId,
  pending,
  canManageFinance = false,
  readOnly = false,
  memberLabel,
  initialExpenseId = "",
  onSubmitExpense,
  onPostExpense,
  onPromoteCompany,
  onReverseExpense,
  onBeginReviseExpense,
}: ExpenseListPanelProps) {
  const [selectedExpenseId, setSelectedExpenseId] = useState(initialExpenseId);
  const [reverseTarget, setReverseTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const selectedExpense = selectedExpenseId
    ? (filteredExpenses.find((expense) => expense.id === selectedExpenseId) ?? null)
    : null;

  useEffect(() => {
    if (!initialExpenseId) return;
    if (filteredExpenses.some((e) => e.id === initialExpenseId)) {
      setSelectedExpenseId(initialExpenseId);
    }
  }, [initialExpenseId, filteredExpenses]);

  useEffect(() => {
    if (
      selectedExpenseId &&
      !filteredExpenses.some((expense) => expense.id === selectedExpenseId)
    ) {
      setSelectedExpenseId(filteredExpenses[0]?.id ?? "");
    }
  }, [filteredExpenses, selectedExpenseId]);

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
      {onExpenseFromChange && onExpenseToChange ? (
        <div className={styles.dateFilterRow}>
          <JalaliDateField
            id="expense-filter-from"
            label="از تاریخ"
            value={expenseFrom}
            onChange={onExpenseFromChange}
            disabled={pending}
          />
          <JalaliDateField
            id="expense-filter-to"
            label="تا تاریخ"
            value={expenseTo}
            onChange={onExpenseToChange}
            disabled={pending}
          />
        </div>
      ) : null}
      {onSearchQueryChange || onPaidByUserIdChange || onCategoryIdChange || onTagIdChange ? (
        <div className={styles.dateFilterRow}>
          {onSearchQueryChange ? (
            <label className="field" htmlFor="expense-filter-q">
              <span>جستجو در عنوان</span>
              <input
                id="expense-filter-q"
                type="search"
                value={searchQuery}
                disabled={pending}
                placeholder="مثلاً ناهار…"
                onChange={(e) => onSearchQueryChange(e.target.value)}
              />
            </label>
          ) : null}
          {onPaidByUserIdChange && payerOptions.length > 0 ? (
            <label className="field" htmlFor="expense-filter-payer">
              <span>پرداخت‌کننده</span>
              <select
                id="expense-filter-payer"
                value={paidByUserId}
                disabled={pending}
                onChange={(e) => onPaidByUserIdChange(e.target.value)}
              >
                <option value="">همه</option>
                {payerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onCategoryIdChange && categoryOptions.length > 0 ? (
            <label className="field" htmlFor="expense-filter-category">
              <span>دسته</span>
              <select
                id="expense-filter-category"
                value={categoryId}
                disabled={pending}
                onChange={(e) => onCategoryIdChange(e.target.value)}
              >
                <option value="">همه دسته‌ها</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onTagIdChange && tagOptions.length > 0 ? (
            <label className="field" htmlFor="expense-filter-tag">
              <span>برچسب</span>
              <select
                id="expense-filter-tag"
                value={tagId}
                disabled={pending}
                onChange={(e) => onTagIdChange(e.target.value)}
              >
                <option value="">همه برچسب‌ها</option>
                {tagOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {onCatalogItemIdChange && catalogOptions.length > 0 ? (
        <label className="field" htmlFor="expense-filter-catalog">
          <span>قلم کاتالوگ</span>
          <select
            id="expense-filter-catalog"
            value={catalogItemId}
            disabled={pending}
            onChange={(e) => onCatalogItemIdChange(e.target.value)}
          >
            <option value="">همه قلم‌ها</option>
            {catalogOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!canManageFinance ? (
        <p className="liveHint">
          پیش‌فرض «همه» است — جمعی‌های گروه به‌علاوه خرج خصوصی خودتان؛ خصوصی دیگران را نمی‌بینید.
          فیلترها روی API اعمال و در URL همگام می‌شوند.
        </p>
      ) : null}
      <div className={styles.masterDetail}>
        <DataList>
          {filteredExpenses.length === 0 ? (
            <EmptyStateBlock
              illustration={<EmptyStateIllustration variant="no-expense" />}
              title={
                expenseFilter === "all"
                  ? "هنوز هزینه‌ای ثبت نشده"
                  : "در این دسته هزینه‌ای نیست"
              }
              description={
                readOnly
                  ? "وقتی خرجی ثبت شود اینجا دیده می‌شود."
                  : "اولین خرج گروه را ثبت کنید تا سهم اعضا روی مانده اعمال شود."
              }
              action={
                readOnly ? undefined : (
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
                )
              }
            />
          ) : null}
          {filteredExpenses.slice(0, 8).map((expense) => (
            <div
              className={selectedExpense?.id === expense.id ? styles.selectedRow : undefined}
              key={expense.id}
            >
              <DataRow
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
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSelectedExpenseId(expense.id);
                        window.requestAnimationFrame(() => {
                          document
                            .getElementById("expense-inspector")
                            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        });
                      }}
                      aria-pressed={selectedExpense?.id === expense.id}
                    >
                      جزئیات
                    </Button>
                    {!readOnly ? (
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
                  {onReverseExpense &&
                  (expense.status === "posted" ||
                    expense.status === "submitted" ||
                    expense.status === "draft") ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setReverseTarget({ id: expense.id, title: expense.title })
                      }
                      disabled={pending}
                    >
                      برگشت / اصلاح
                    </Button>
                  ) : null}
                  {selectedId ? (
                    <ExpenseReceiptUpload
                      workspaceId={selectedId}
                      expenseId={expense.id}
                      ocrMode={ocrMode}
                      onApplyOcr={onApplyOcr}
                    />
                  ) : null}
                      </>
                    ) : null}
                  </>
                }
              />
            </div>
          ))}
        </DataList>

        {selectedExpense ? (
          <aside
            id="expense-inspector"
            className={styles.inspector}
            aria-label={`جزئیات ${selectedExpense.title}`}
          >
            <header className={styles.inspectorHead}>
              <span className={styles.inspectorLabel}>{t("finance.inspectorLabel")}</span>
              <button
                type="button"
                className="textButton"
                onClick={() => setSelectedExpenseId("")}
              >
                {t("finance.inspectorClose")}
              </button>
            </header>
            <h3>{selectedExpense.title}</h3>
            <Amount irrMinor={selectedExpense.total.amountMinor} />
            <dl>
              <div><dt>وضعیت</dt><dd>{expenseStatusLabel(selectedExpense.status)}</dd></div>
              <div><dt>نوع خرج</dt><dd>{expenseVisibilityLabel(selectedExpense.visibility)}</dd></div>
              <div><dt>پرداخت‌کننده</dt><dd>{memberLabel(selectedExpense.paidByUserId)}</dd></div>
              {selectedExpense.paymentLines && selectedExpense.paymentLines.length > 1 ? (
                <div>
                  <dt>پرداخت‌کنندگان</dt>
                  <dd>
                    <ul className={styles.splitList}>
                      {selectedExpense.paymentLines.map((line) => (
                        <li key={line.userId}>
                          <span>{memberLabel(line.userId)}</span>
                          <Amount irrMinor={line.amount.amountMinor} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              <div><dt>تاریخ وقوع</dt><dd>{formatFaDate(selectedExpense.occurredOn)}</dd></div>
              <div><dt>افراد سهیم</dt><dd>{selectedExpense.participantUserIds.length}</dd></div>
              <div><dt>اقلام</dt><dd>{selectedExpense.items?.length ?? 0}</dd></div>
              <div><dt>نیازمند تأیید</dt><dd>{selectedExpense.requiresApproval ? "بله" : "خیر"}</dd></div>
            </dl>
            {selectedExpense.costCenterId ? (
              <p>مرکز هزینه: <code>{selectedExpense.costCenterId}</code></p>
            ) : null}
            {selectedExpense.originalCurrency ? (
              <p>ارز مبدأ: {selectedExpense.originalCurrency}</p>
            ) : null}
            {selectedExpense.splits.length > 0 ? (
              <div className={styles.splitBlock}>
                <h4>سهم اعضا</h4>
                <ul className={styles.splitList}>
                  {selectedExpense.splits.map((line) => (
                    <li key={line.userId}>
                      <span>{memberLabel(line.userId)}</span>
                      <Amount irrMinor={line.amount.amountMinor} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="liveHint">جزئیات سهم برای این خرج در دسترس نیست.</p>
            )}
            {selectedId ? (
              <ExpenseCommentsPanel
                workspaceId={selectedId}
                expenseId={selectedExpense.id}
                readOnly={readOnly}
              />
            ) : null}
            {!readOnly &&
            onReverseExpense &&
            selectedExpense.status !== "reversed" ? (
              <div className={styles.splitBlock}>
                <p className="liveHint">
                  اگر خرج اشتباه ثبت شده، برگشت بزنید یا با «اصلاح» فرم را پر کنید تا
                  جایگزین ثبت شود. دفتر روزانه برای خطوط روزانه‌اش ویرایش مستقیم دارد.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    setReverseTarget({
                      id: selectedExpense.id,
                      title: selectedExpense.title,
                    })
                  }
                >
                  برگشت / اصلاح خرج
                </Button>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
      {reverseTarget && onReverseExpense ? (
        <ReverseExpenseDialog
          expenseTitle={reverseTarget.title}
          pending={pending}
          onCancel={() => setReverseTarget(null)}
          onConfirm={(reason) => {
            const id = reverseTarget.id;
            setReverseTarget(null);
            onReverseExpense(id, reason);
          }}
          onConfirmRevise={
            onBeginReviseExpense
              ? (reason) => {
                  const id = reverseTarget.id;
                  setReverseTarget(null);
                  onBeginReviseExpense(id, reason);
                }
              : undefined
          }
        />
      ) : null}
    </SectionCard>
  );
}
