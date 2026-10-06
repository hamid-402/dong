"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ExpenseSummary, ExpenseVisibility, SpaceKind } from "@dang/contracts";
import { explainExpenseFundingSettlement } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyStateBlock,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import { EmptyStateIllustration } from "@/components/ui/empty-state-illustration";
import { ExpenseReceiptUpload, type OcrFormHints } from "@/components/expense-receipt-upload";
import { ExpenseCommentsPanel } from "@/components/expense-comments-panel";
import { JalaliDateField } from "@/components/jalali-date-field";
import { formatFaDate } from "@/lib/fa-datetime";
import { t } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav-labels";
import { expenseStatusLabel, expenseVisibilityLabel, expenseAudienceLine } from "@/lib/status-labels";
import { ReverseExpenseDialog } from "@/components/views/finance/reverse-expense-dialog";
import styles from "./expense-list-panel.module.css";
import selStyles from "@/components/selection/selection-action-bar.module.css";

type ExpenseFilter = "all" | ExpenseVisibility;
type SourceFilter = "all" | "daily" | "full";

type ExpenseListPanelProps = {
  filteredExpenses: ExpenseSummary[];
  expenseFilter: ExpenseFilter;
  onFilterChange: (filter: ExpenseFilter) => void;
  /** Optional link to daily ledger for empty-state CTA. */
  ledgerHref?: string | null;
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
  onApplyOcr?: (hints: OcrFormHints) => void;
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
  /** Restore reversed → new posted expense on balance. */
  onRestoreExpense?: (expenseId: string) => void;
  /** Hard-delete reversed (or draft) row. */
  onPurgeExpense?: (expenseId: string) => void;
  /** Prefill create form; submit will call revise (reverse+recreate). */
  onBeginReviseExpense?: (expenseId: string, reason: string) => void;
  spaceKind?: SpaceKind;
  /** When true, inspector shows fund-party settlement explanation. */
  fundAsSettlementParty?: boolean;
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
  onRestoreExpense,
  onPurgeExpense,
  onBeginReviseExpense,
  spaceKind,
  fundAsSettlementParty = false,
  ledgerHref = null,
}: ExpenseListPanelProps) {
  const friendLike = spaceKind === "group" || spaceKind === "personal";
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showReversed, setShowReversed] = useState(false);
  const [forUserId, setForUserId] = useState("");
  const [listLimit, setListLimit] = useState(40);
  useEffect(() => {
    setListLimit(40);
  }, [
    expenseFilter,
    sourceFilter,
    showReversed,
    expenseFrom,
    expenseTo,
    searchQuery,
    catalogItemId,
    paidByUserId,
    categoryId,
    tagId,
    forUserId,
  ]);
  const sourceScopedExpenses = useMemo(() => {
    let rows = filteredExpenses;
    if (!showReversed) {
      rows = rows.filter((e) => e.status !== "reversed");
    }
    if (sourceFilter === "daily") {
      rows = rows.filter((e) => e.source === "daily_ledger");
    } else if (sourceFilter === "full") {
      rows = rows.filter((e) => e.source !== "daily_ledger");
    }
    if (forUserId) {
      rows = rows.filter(
        (e) =>
          e.paidByUserId === forUserId ||
          (e.participantUserIds ?? []).includes(forUserId),
      );
    }
    const q = searchQuery?.trim().toLowerCase() ?? "";
    if (q) {
      rows = rows.filter((e) => {
        if (e.title.toLowerCase().includes(q)) return true;
        if (memberLabel(e.paidByUserId).toLowerCase().includes(q)) return true;
        return (e.participantUserIds ?? []).some((id) =>
          memberLabel(id).toLowerCase().includes(q),
        );
      });
    }
    return [...rows].sort((a, b) => {
      const byDate = b.occurredOn.localeCompare(a.occurredOn);
      if (byDate !== 0) return byDate;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [
    filteredExpenses,
    sourceFilter,
    showReversed,
    forUserId,
    searchQuery,
    memberLabel,
  ]);
  const reversedHiddenCount = useMemo(
    () =>
      showReversed
        ? 0
        : filteredExpenses.filter((e) => e.status === "reversed").length,
    [filteredExpenses, showReversed],
  );
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (expenseFilter !== "all") {
      chips.push({
        key: "vis",
        label: `نوع: ${expenseVisibilityLabel(expenseFilter)}`,
        onClear: () => onFilterChange("all"),
      });
    }
    if (sourceFilter !== "all") {
      chips.push({
        key: "src",
        label:
          sourceFilter === "daily"
            ? `مسیر: ${NAV_LABELS.dailyEntry}`
            : `مسیر: ${NAV_LABELS.fullExpense}`,
        onClear: () => setSourceFilter("all"),
      });
    }
    if (showReversed) {
      chips.push({
        key: "rev",
        label: "ابطال‌شده‌ها",
        onClear: () => setShowReversed(false),
      });
    }
    if (searchQuery?.trim()) {
      chips.push({
        key: "q",
        label: `جستجو: ${searchQuery.trim()}`,
        onClear: () => onSearchQueryChange?.(""),
      });
    }
    if (expenseFrom) {
      chips.push({
        key: "from",
        label: `از ${formatFaDate(expenseFrom)}`,
        onClear: () => onExpenseFromChange?.(""),
      });
    }
    if (expenseTo) {
      chips.push({
        key: "to",
        label: `تا ${formatFaDate(expenseTo)}`,
        onClear: () => onExpenseToChange?.(""),
      });
    }
    if (paidByUserId) {
      const name =
        payerOptions.find((p) => p.id === paidByUserId)?.name ??
        memberLabel(paidByUserId);
      chips.push({
        key: "payer",
        label: `پرداخت‌کننده: ${name}`,
        onClear: () => onPaidByUserIdChange?.(""),
      });
    }
    if (forUserId) {
      const name =
        payerOptions.find((p) => p.id === forUserId)?.name ??
        memberLabel(forUserId);
      chips.push({
        key: "for",
        label: `برای / سهیم: ${name}`,
        onClear: () => setForUserId(""),
      });
    }
    if (categoryId) {
      const name =
        categoryOptions.find((c) => c.id === categoryId)?.name ?? categoryId;
      chips.push({
        key: "cat",
        label: `دسته: ${name}`,
        onClear: () => onCategoryIdChange?.(""),
      });
    }
    if (tagId) {
      const name = tagOptions.find((t) => t.id === tagId)?.name ?? tagId;
      chips.push({
        key: "tag",
        label: `برچسب: ${name}`,
        onClear: () => onTagIdChange?.(""),
      });
    }
    if (catalogItemId) {
      const name =
        catalogOptions.find((c) => c.id === catalogItemId)?.name ??
        catalogItemId;
      chips.push({
        key: "catItem",
        label: `قلم: ${name}`,
        onClear: () => onCatalogItemIdChange?.(""),
      });
    }
    return chips;
  }, [
    expenseFilter,
    sourceFilter,
    showReversed,
    searchQuery,
    expenseFrom,
    expenseTo,
    paidByUserId,
    forUserId,
    categoryId,
    tagId,
    catalogItemId,
    payerOptions,
    categoryOptions,
    tagOptions,
    catalogOptions,
    memberLabel,
    onFilterChange,
    onSearchQueryChange,
    onExpenseFromChange,
    onExpenseToChange,
    onPaidByUserIdChange,
    onCategoryIdChange,
    onTagIdChange,
    onCatalogItemIdChange,
  ]);

  function clearAllFilters() {
    onFilterChange("all");
    setSourceFilter("all");
    setShowReversed(false);
    setForUserId("");
    onSearchQueryChange?.("");
    onExpenseFromChange?.("");
    onExpenseToChange?.("");
    onPaidByUserIdChange?.("");
    onCategoryIdChange?.("");
    onTagIdChange?.("");
    onCatalogItemIdChange?.("");
  }
  const visibleExpenses = useMemo(
    () => sourceScopedExpenses.slice(0, listLimit),
    [sourceScopedExpenses, listLimit],
  );
  const hasMore = sourceScopedExpenses.length > visibleExpenses.length;
  const dayGroups = useMemo(() => {
    const groups: Array<{
      occurredOn: string;
      expenses: ExpenseSummary[];
      totalMinor: string;
    }> = [];
    for (const expense of visibleExpenses) {
      const last = groups[groups.length - 1];
      if (last && last.occurredOn === expense.occurredOn) {
        last.expenses.push(expense);
        last.totalMinor = (
          BigInt(last.totalMinor) + BigInt(expense.total.amountMinor)
        ).toString();
      } else {
        groups.push({
          occurredOn: expense.occurredOn,
          expenses: [expense],
          totalMinor: expense.total.amountMinor,
        });
      }
    }
    return groups;
  }, [visibleExpenses]);
  const selection = useRowSelection(visibleExpenses.map((e) => e.id));
  const [selectedExpenseId, setSelectedExpenseId] = useState(initialExpenseId);
  const [reverseTarget, setReverseTarget] = useState<{
    id: string;
    title: string;
    intent?: "revise" | "void";
  } | null>(null);
  const selectedExpense = selectedExpenseId
    ? (sourceScopedExpenses.find((expense) => expense.id === selectedExpenseId) ??
      null)
    : null;
  const barExpense =
    selection.selectedCount === 1
      ? (visibleExpenses.find((e) => e.id === selection.selectedIds[0]) ?? null)
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

  function openInspector(expenseId: string) {
    setSelectedExpenseId(expenseId);
    window.requestAnimationFrame(() => {
      document
        .getElementById("expense-inspector")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <SectionCard
      id="expense-list"
      title={NAV_LABELS.expenses}
      badge={sourceScopedExpenses.length}
      description={
        friendLike
          ? `گروه‌بندی بر اساس تاریخ وقوع (جدید → قدیم). ${NAV_LABELS.fullExpense} از فرم بالا؛ ${NAV_LABELS.dailyEntry} از دفتر. روی ردیف → جزئیات و مدیریت.`
          : `گروه‌بندی بر اساس تاریخ وقوع (جدید → قدیم). فیلترها و جستجو را از بالا تنظیم کنید.`
      }
      delayClass="delay2"
    >
      <div className={styles.searchBar}>
        <label className={styles.searchField} htmlFor="expense-list-search">
          <span className={styles.searchLabel}>جستجو</span>
          <input
            id="expense-list-search"
            type="search"
            value={searchQuery}
            disabled={pending || !onSearchQueryChange}
            placeholder="عنوان، پرداخت‌کننده یا نام سهیم…"
            onChange={(e) => onSearchQueryChange?.(e.target.value)}
            autoComplete="off"
          />
        </label>
        {searchQuery?.trim() ? (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => onSearchQueryChange?.("")}
          >
            پاک‌کردن
          </button>
        ) : null}
      </div>

      <div className={styles.filterChrome}>
        <div className={styles.filterGroup}>
          <span className={styles.filterGroupLabel}>نوع</span>
          <div className={styles.filterChips} role="tablist" aria-label="فیلتر نوع خرج">
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
                className={
                  expenseFilter === key
                    ? `${styles.filterChip} ${styles.filterChipActive}`
                    : styles.filterChip
                }
                onClick={() => onFilterChange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterGroupLabel}>مسیر</span>
          <div className={styles.filterChips} role="tablist" aria-label="فیلتر مسیر ثبت">
            {(
              [
                ["all", "همه مسیرها"],
                ["daily", NAV_LABELS.dailyEntry],
                ["full", NAV_LABELS.fullExpense],
              ] as Array<[SourceFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={sourceFilter === key}
                className={
                  sourceFilter === key
                    ? `${styles.filterChip} ${styles.filterChipActive}`
                    : styles.filterChip
                }
                onClick={() => setSourceFilter(key)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={
                showReversed
                  ? `${styles.filterChip} ${styles.filterChipActive}`
                  : styles.filterChip
              }
              aria-pressed={showReversed}
              onClick={() => setShowReversed((v) => !v)}
            >
              ابطال‌شده
              {reversedHiddenCount > 0
                ? ` (${reversedHiddenCount.toLocaleString("fa-IR")})`
                : ""}
            </button>
          </div>
        </div>

        <div className={styles.filtersGrid}>
          {onExpenseFromChange && onExpenseToChange ? (
            <>
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
            </>
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
          {payerOptions.length > 0 ? (
            <label className="field" htmlFor="expense-filter-for">
              <span>برای / سهیم</span>
              <select
                id="expense-filter-for"
                value={forUserId}
                disabled={pending}
                onChange={(e) => setForUserId(e.target.value)}
              >
                <option value="">همه اعضا</option>
                {payerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {(onCategoryIdChange && categoryOptions.length > 0) ||
        (onTagIdChange && tagOptions.length > 0) ||
        (onCatalogItemIdChange && catalogOptions.length > 0) ? (
          <details className={styles.filtersFold}>
            <summary>بیشتر (دسته، برچسب، قلم کاتالوگ)</summary>
            <div className={styles.filtersGrid}>
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
                    {tagOptions.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
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
            </div>
          </details>
        ) : null}
      </div>

      {activeFilterChips.length > 0 ? (
        <div className={styles.activeFilters} aria-label="فیلترهای فعال">
          <div className={styles.activeFilterChips}>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={styles.activeChip}
                onClick={chip.onClear}
                title="حذف این فیلتر"
              >
                {chip.label}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <button type="button" className="textButton" onClick={clearAllFilters}>
            پاک‌کردن همه
          </button>
        </div>
      ) : null}

      {!canManageFinance ? (
        <p className="liveHint">
          پیش‌فرض «همه» است — جمعی‌های گروه به‌علاوه خرج خصوصی خودتان؛ خصوصی دیگران را نمی‌بینید.
        </p>
      ) : null}
      <p className={styles.listLegend} role="status">
        <span>
          {visibleExpenses.length.toLocaleString("fa-IR")}
          {hasMore ? ` از ${sourceScopedExpenses.length.toLocaleString("fa-IR")}` : ""}{" "}
          ردیف · گروه‌بندی بر اساس تاریخ وقوع
        </span>
        {reversedHiddenCount > 0 ? (
          <button
            type="button"
            className="textButton"
            onClick={() => setShowReversed(true)}
          >
            {reversedHiddenCount.toLocaleString("fa-IR")} ابطال‌شده پنهان
          </button>
        ) : null}
      </p>
      <div className={styles.masterDetail}>
        <div className={styles.listColumn}>
        {visibleExpenses.length > 0 ? (
          <SelectionActionBar
            selectedCount={selection.selectedCount}
            idleHint="روی ردیف بزنید تا جزئیات باز شود؛ مربع برای انتخاب چندتایی"
            onClear={selection.clear}
          >
            <Button
              type="button"
              variant="secondary"
              disabled={!barExpense}
              onClick={() => barExpense && openInspector(barExpense.id)}
            >
              جزئیات
            </Button>
            {!readOnly && barExpense?.status === "draft" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onSubmitExpense(barExpense.id)}
              >
                ارسال
              </Button>
            ) : null}
            {!readOnly &&
            barExpense &&
            (barExpense.status === "draft" || barExpense.status === "submitted") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onPostExpense(barExpense.id)}
              >
                {friendLike ? "ثبت نهایی" : "ثبت در دفترکل"}
              </Button>
            ) : null}
            {!readOnly &&
            barExpense &&
            supportsCompany &&
            canApproveCompany &&
            barExpense.visibility === "private" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onPromoteCompany(barExpense.id)}
              >
                تأیید شرکتی
              </Button>
            ) : null}
            {!readOnly &&
            barExpense &&
            onReverseExpense &&
            (barExpense.status === "posted" ||
              barExpense.status === "submitted" ||
              barExpense.status === "draft") ? (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  setReverseTarget({
                    id: barExpense.id,
                    title: barExpense.title,
                    intent: "revise",
                  })
                }
              >
                ویرایش / حذف
              </Button>
            ) : null}
            {!readOnly && barExpense && selectedId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => openInspector(barExpense.id)}
              >
                پیوست رسید
              </Button>
            ) : null}
          </SelectionActionBar>
        ) : null}
        <DataList>
          {sourceScopedExpenses.length === 0 ? (
            <EmptyStateBlock
              illustration={<EmptyStateIllustration variant="no-expense" />}
              title={
                expenseFilter === "all" && sourceFilter === "all"
                  ? "هنوز هزینه‌ای ثبت نشده"
                  : "در این فیلتر هزینه‌ای نیست"
              }
              description={
                readOnly
                  ? "وقتی خرجی ثبت شود اینجا دیده می‌شود."
                  : sourceFilter === "daily"
                    ? `هنوز ${NAV_LABELS.dailyEntry} نیست — از دفتر روزانه تیک بزنید.`
                    : `اولین ${NAV_LABELS.fullExpense} را ثبت کنید؛ برای مصرف تکراری از ${NAV_LABELS.dailyEntry} استفاده کنید.`
              }
              action={
                readOnly ? undefined : (
                  <span className="dataRowActions">
                    <Button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById("expense-panel")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                    >
                      {NAV_LABELS.fullExpense}
                    </Button>
                    {ledgerHref && spaceKind !== "personal" ? (
                      <Link className="textButton" href={ledgerHref}>
                        {NAV_LABELS.dailyEntry}
                      </Link>
                    ) : null}
                  </span>
                )
              }
            />
          ) : null}
          {dayGroups.map((group) => (
            <section key={group.occurredOn} className={styles.dayGroup}>
              <header className={styles.dayHead}>
                <span className={styles.dayLabel}>
                  {formatFaDate(group.occurredOn)}
                  <span className={styles.dayCount}>
                    {" · "}
                    {group.expenses.length.toLocaleString("fa-IR")} خرج
                  </span>
                </span>
                <span className={styles.dayTotal}>
                  <Amount irrMinor={group.totalMinor} />
                </span>
              </header>
              {group.expenses.map((expense) => (
                <div
                  className={[
                    selStyles.selectableRow,
                    styles.expenseRow,
                    selection.isSelected(expense.id) ||
                    selectedExpense?.id === expense.id
                      ? styles.selectedRow
                      : "",
                    expense.status === "reversed" ? styles.rowReversed : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={expense.id}
                  tabIndex={0}
                  aria-label={`جزئیات ${expense.title}`}
                  aria-current={
                    selectedExpense?.id === expense.id ? "true" : undefined
                  }
                  {...rowSelectActivateProps({
                    onActivate: () => {
                      if (selectedExpenseId === expense.id) {
                        setSelectedExpenseId("");
                        selection.clear();
                        return;
                      }
                      selection.selectOnly(expense.id);
                      openInspector(expense.id);
                    },
                  })}
                >
                  <DataRow
                    title={
                      <span className={styles.rowTitleWithCheck}>
                        <RowSelectCheckbox
                          checked={selection.isSelected(expense.id)}
                          onChange={() => {
                            if (selection.isSelected(expense.id)) selection.clear();
                            else selection.selectOnly(expense.id);
                          }}
                          label={`انتخاب ${expense.title}`}
                        />
                        <span className={styles.rowTitleStack}>
                          <span className={styles.rowTitleText}>{expense.title}</span>
                          <span
                            className={
                              expense.visibility === "private"
                                ? `${styles.rowAudience} ${styles.rowAudiencePrivate}`
                                : expense.visibility === "company"
                                  ? `${styles.rowAudience} ${styles.rowAudienceCompany}`
                                  : `${styles.rowAudience} ${styles.rowAudienceShared}`
                            }
                          >
                            {expenseAudienceLine(expense, memberLabel)}
                          </span>
                          <span className={styles.rowDate}>
                            پرداخت: {memberLabel(expense.paidByUserId)}
                            {expense.quantity != null && expense.quantity > 0
                              ? ` · تعداد ${new Intl.NumberFormat("fa-IR").format(expense.quantity)}`
                              : ""}
                          </span>
                        </span>
                      </span>
                    }
                    meta={
                      <span className={styles.rowPills}>
                        {expense.source === "daily_ledger" ? (
                          <StatusPill tone="ok">{NAV_LABELS.dailyEntry}</StatusPill>
                        ) : (
                          <StatusPill tone="gold">{NAV_LABELS.fullExpense}</StatusPill>
                        )}
                        <StatusPill
                          tone={expense.status === "posted" ? "ok" : "warn"}
                        >
                          {expenseStatusLabel(expense.status)}
                        </StatusPill>
                      </span>
                    }
                    trailing={
                      <span className={styles.rowAmount}>
                        <Amount irrMinor={expense.total.amountMinor} />
                      </span>
                    }
                  />
                </div>
              ))}
            </section>
          ))}
        </DataList>
        {hasMore ? (
          <div className={styles.listMore}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setListLimit((n) => n + 40)}
            >
              نمایش بیشتر (
              {(sourceScopedExpenses.length - visibleExpenses.length).toLocaleString(
                "fa-IR",
              )}{" "}
              باقی)
            </Button>
          </div>
        ) : null}
        </div>

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
            <div className={styles.inspectorHero}>
              <h3>{selectedExpense.title}</h3>
              <p
                className={
                  selectedExpense.visibility === "private"
                    ? `${styles.inspectorAudience} ${styles.rowAudiencePrivate}`
                    : selectedExpense.visibility === "company"
                      ? `${styles.inspectorAudience} ${styles.rowAudienceCompany}`
                      : `${styles.inspectorAudience} ${styles.rowAudienceShared}`
                }
              >
                {expenseAudienceLine(selectedExpense, memberLabel)}
              </p>
              <p className={styles.inspectorHeroMeta}>
                {formatFaDate(selectedExpense.occurredOn)}
                {" · "}
                {expenseStatusLabel(selectedExpense.status)}
                {" · "}
                {selectedExpense.source === "daily_ledger"
                  ? NAV_LABELS.dailyEntry
                  : NAV_LABELS.fullExpense}
                {" · پرداخت‌کننده: "}
                {memberLabel(selectedExpense.paidByUserId)}
              </p>
              <div className={styles.inspectorHeroAmount}>
                <Amount irrMinor={selectedExpense.total.amountMinor} />
              </div>
            </div>
            {!readOnly ? (
              <div className={styles.inspectorActions} role="toolbar" aria-label="مدیریت خرج">
                {selectedExpense.status === "reversed" ? (
                  <>
                    <div className={styles.actionStatus}>
                      <StatusPill tone="warn">قبلاً ابطال شده</StatusPill>
                    </div>
                    {selectedExpense.reverseReason ||
                    selectedExpense.reversedByUserId ||
                    selectedExpense.reversedAt ? (
                      <p className={styles.inspectorActionHint}>
                        {selectedExpense.reverseReason
                          ? `دلیل: ${selectedExpense.reverseReason}`
                          : "دلیل ثبت نشده"}
                        {selectedExpense.reversedByUserId
                          ? ` · توسط ${memberLabel(selectedExpense.reversedByUserId)}`
                          : ""}
                        {selectedExpense.reversedAt
                          ? ` · ${formatFaDate(selectedExpense.reversedAt)}`
                          : ""}
                      </p>
                    ) : (
                      <p className={styles.inspectorActionHint}>
                        اثر از مانده خنثی شده. اگر قبل از این نسخه ابطال شده، دلیل/عامل
                        ممکن است ثبت نشده باشد.
                      </p>
                    )}
                    <div className={styles.actionRow}>
                      {onRestoreExpense ? (
                        <Button
                          type="button"
                          disabled={pending}
                          onClick={() => onRestoreExpense(selectedExpense.id)}
                        >
                          بازیابی به مانده
                        </Button>
                      ) : null}
                      {onPurgeExpense ? (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={pending}
                          onClick={() => {
                            if (
                              typeof window !== "undefined" &&
                              !window.confirm(
                                `«${selectedExpense.title}» برای همیشه از فهرست حذف شود؟ این عمل برگشت‌پذیر نیست.`,
                              )
                            ) {
                              return;
                            }
                            onPurgeExpense(selectedExpense.id);
                            setSelectedExpenseId("");
                          }}
                        >
                          حذف کامل
                        </Button>
                      ) : null}
                    </div>
                    {ledgerHref && selectedExpense.source === "daily_ledger" ? (
                      <div className={styles.actionLinks}>
                        <Link
                          className="textButton"
                          href={`${ledgerHref}?date=${encodeURIComponent(selectedExpense.occurredOn)}`}
                        >
                          همان روز در {NAV_LABELS.ledger}
                        </Link>
                      </div>
                    ) : null}
                    <p className={styles.inspectorActionHint}>
                      بازیابی = ساخت ردیف فعال جدید روی مانده. حذف کامل = پاک‌کردن همین
                      ردیف ابطال‌شده از فهرست.
                    </p>
                  </>
                ) : (
                  <>
                    <div className={styles.actionRow}>
                      {onBeginReviseExpense && onReverseExpense ? (
                        <Button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setReverseTarget({
                              id: selectedExpense.id,
                              title: selectedExpense.title,
                              intent: "revise",
                            })
                          }
                        >
                          ویرایش
                        </Button>
                      ) : null}
                      {onReverseExpense ? (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={pending}
                          onClick={() =>
                            setReverseTarget({
                              id: selectedExpense.id,
                              title: selectedExpense.title,
                              intent: "void",
                            })
                          }
                        >
                          حذف
                        </Button>
                      ) : null}
                    </div>
                    {(selectedExpense.status === "draft" ||
                      selectedExpense.status === "submitted" ||
                      (supportsCompany &&
                        canApproveCompany &&
                        selectedExpense.visibility === "private")) ? (
                      <div className={`${styles.actionRow} ${styles.actionRowSecondary}`}>
                        {selectedExpense.status === "draft" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => onSubmitExpense(selectedExpense.id)}
                          >
                            ارسال
                          </Button>
                        ) : null}
                        {selectedExpense.status === "draft" ||
                        selectedExpense.status === "submitted" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => onPostExpense(selectedExpense.id)}
                          >
                            {friendLike ? "ثبت نهایی" : "ثبت در دفترکل"}
                          </Button>
                        ) : null}
                        {supportsCompany &&
                        canApproveCompany &&
                        selectedExpense.visibility === "private" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => onPromoteCompany(selectedExpense.id)}
                          >
                            تأیید شرکتی
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedExpense.source === "daily_ledger" && ledgerHref ? (
                      <div className={styles.actionLinks}>
                        <Link
                          className="textButton"
                          href={`${ledgerHref}?date=${encodeURIComponent(selectedExpense.occurredOn)}`}
                        >
                          تیک در {NAV_LABELS.ledger}
                        </Link>
                      </div>
                    ) : null}
                    <p className={styles.inspectorActionHint}>
                      ویرایش و حذف روی همین صفحه است (اثر مانده خنثی می‌شود؛ حذف سخت
                      نیست).
                      {selectedExpense.source === "daily_ledger"
                        ? ` تیک روز×عضو را از ${NAV_LABELS.ledger} هم می‌توانید عوض کنید.`
                        : null}
                    </p>
                  </>
                )}
              </div>
            ) : null}
            {!readOnly && selectedId ? (
              <div className={styles.receiptBlock}>
                <h4 className={styles.receiptTitle}>رسید و پیوست</h4>
                <ExpenseReceiptUpload
                  workspaceId={selectedId}
                  expenseId={selectedExpense.id}
                  ocrMode={ocrMode}
                  onApplyOcr={onApplyOcr}
                />
              </div>
            ) : null}
            <dl className={styles.metaList}>
              <div>
                <dt>برای چه کسی</dt>
                <dd>{expenseAudienceLine(selectedExpense, memberLabel)}</dd>
              </div>
              <div><dt>وضعیت</dt><dd>{expenseStatusLabel(selectedExpense.status)}</dd></div>
              <div><dt>نوع خرج</dt><dd>{expenseVisibilityLabel(selectedExpense.visibility)}</dd></div>
              <div><dt>پرداخت‌کننده</dt><dd>{memberLabel(selectedExpense.paidByUserId)}</dd></div>
              {(selectedExpense.participantUserIds?.length ?? 0) > 0 ? (
                <div>
                  <dt>افراد سهیم</dt>
                  <dd>
                    {selectedExpense.participantUserIds
                      .map((id) => memberLabel(id))
                      .join("، ")}
                  </dd>
                </div>
              ) : null}
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
            {(() => {
              const explain = explainExpenseFundingSettlement(selectedExpense, {
                fundAsSettlementParty,
                defaultFundId: selectedExpense.fundingRefId,
              });
              return (
                <div className={styles.splitBlock}>
                  <h4>شفافیت تسویه و منبع پرداخت</h4>
                  <ul className="liveHint" style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                    {explain.notesFa.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                  <ul className={styles.splitList}>
                    {explain.lines.map((line) => (
                      <li key={`${line.userId}-${line.roleFa}`}>
                        <span>
                          {memberLabel(line.userId)} — {line.roleFa}
                        </span>
                        <Amount irrMinor={line.amountMinor} />
                      </li>
                    ))}
                  </ul>
                  {explain.mode === "personal_advance" ? (
                    <p className="liveHint">
                      جبران ناخالص پرداخت‌کننده (قبل از تهاتر بدهی قبلی):{" "}
                      <Amount irrMinor={explain.payerGrossReimbursableMinor} />
                    </p>
                  ) : null}
                </div>
              );
            })()}
            {selectedId ? (
              <ExpenseCommentsPanel
                workspaceId={selectedId}
                expenseId={selectedExpense.id}
                readOnly={readOnly}
              />
            ) : null}
          </aside>
        ) : visibleExpenses.length > 0 ? (
          <aside className={styles.inspectorEmpty} aria-label="جزئیات خرج">
            <p>یک ردیف را انتخاب کنید تا جزئیات و دکمه‌های مدیریت اینجا باز شود.</p>
          </aside>
        ) : null}
      </div>
      {reverseTarget && onReverseExpense ? (
        <ReverseExpenseDialog
          expenseTitle={reverseTarget.title}
          pending={pending}
          intent={reverseTarget.intent}
          onCancel={() => setReverseTarget(null)}
          onConfirm={(reason) => {
            const id = reverseTarget.id;
            setReverseTarget(null);
            setSelectedExpenseId("");
            onReverseExpense(id, reason);
          }}
          onConfirmRevise={
            onBeginReviseExpense && reverseTarget.intent !== "void"
              ? (reason) => {
                  const id = reverseTarget.id;
                  setReverseTarget(null);
                  setSelectedExpenseId("");
                  onBeginReviseExpense(id, reason);
                }
              : undefined
          }
        />
      ) : null}
    </SectionCard>
  );
}
