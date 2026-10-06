"use client";

import { useMemo } from "react";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { JalaliDateField } from "@/components/jalali-date-field";
import { api } from "@/lib/api";
import { formatFaDate } from "@/lib/fa-datetime";
import {
  personalExportStatusLabel,
  settlementStatusLabel,
} from "@/lib/status-labels";
import { PersonalResourcesAccountList } from "./personal-resources-account-list";
import { PersonalResourcesSummaryBlock } from "./personal-resources-summary";
import { PersonalResourcesTransferForm } from "./personal-resources-transfer-form";
import {
  txnKindLabel,
  usePersonalResourcesData,
} from "./use-personal-resources-data";

/** Personal wallets / budgets — API-backed only. */
export function PersonalResourcesPanel() {
  const d = usePersonalResourcesData();
  const categoryIds = useMemo(() => d.categories.map((c) => c.id), [d.categories]);
  const categorySel = useRowSelection(categoryIds);
  const barCategory =
    categorySel.selectedCount === 1
      ? (d.categories.find((c) => c.id === categorySel.selectedIds[0]) ?? null)
      : null;

  const txnIds = useMemo(() => d.txns.map((t) => t.id), [d.txns]);
  const txnSel = useRowSelection(txnIds);
  const barTxn =
    txnSel.selectedCount === 1
      ? (d.txns.find((t) => t.id === txnSel.selectedIds[0]) ?? null)
      : null;

  function renameSelectedCategory() {
    if (!barCategory) return;
    const next = window.prompt("نام جدید دسته", barCategory.name);
    if (!next?.trim()) return;
    d.run("دسته به‌روز شد", async () => {
      await api.updatePersonalCategory(barCategory.id, { name: next.trim() });
    });
    categorySel.clear();
  }

  function deleteSelectedCategories() {
    if (categorySel.selectedCount === 0) return;
    const ids = categorySel.selectedIds;
    const label =
      ids.length === 1
        ? "این دسته حذف شود؟"
        : `${ids.length.toLocaleString("fa-IR")} دسته حذف شوند؟`;
    if (!window.confirm(label)) return;
    for (const id of ids) d.onDeleteCategory(id);
    categorySel.clear();
  }

  function contributeSelectedTxn() {
    if (!barTxn) return;
    d.onContributeTxnToGoal(barTxn);
    txnSel.clear();
  }

  return (
    <SectionCard title="منابع مالی شخصی" delayClass="delay1">
      <FormStack>
        <StatusLine>
          حساب‌های نقد/بانک/کارت — بودجه پاکت روی ماه شمسی فعلی. لینک به خرج/تسویه فقط با انتخاب صریح.
        </StatusLine>

        <PersonalResourcesSummaryBlock summary={d.summary} />

        {d.error ? <p className="liveError">{d.error}</p> : null}
        {d.info ? <p className="liveSuccess">{d.info}</p> : null}

        <PersonalResourcesAccountList
          accounts={d.accounts}
          pending={d.pending}
          showArchived={d.showArchived}
          onShowArchivedChange={d.setShowArchived}
          accountName={d.accountName}
          onAccountNameChange={d.setAccountName}
          accountKind={d.accountKind}
          onAccountKindChange={d.setAccountKind}
          openingToman={d.openingToman}
          onOpeningTomanChange={d.setOpeningToman}
          renameId={d.renameId}
          renameValue={d.renameValue}
          onRenameIdChange={d.setRenameId}
          onRenameValueChange={d.setRenameValue}
          onCreateAccount={d.onCreateAccount}
          onRenameAccount={d.onRenameAccount}
          onToggleArchive={d.onToggleArchive}
        />

        <h3 className="pfSubhead">ثبت تراکنش</h3>
        <div className="pfRangeRow">
          <SelectField
            label="حساب"
            value={d.txnAccountId}
            onChange={(e) => d.setTxnAccountId(e.target.value)}
          >
            <option value="">انتخاب…</option>
            {d.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="نوع"
            value={d.txnKind}
            onChange={(e) =>
              d.setTxnKind(
                e.target.value as
                  | "income"
                  | "expense"
                  | "adjustment"
                  | "investment"
                  | "installment",
              )
            }
          >
            <option value="expense">هزینه</option>
            <option value="income">درآمد</option>
            <option value="installment">قسط</option>
            <option value="investment">سرمایه‌گذاری</option>
            <option value="adjustment">تعدیل (افزایش)</option>
          </SelectField>
          <TextField
            label="مبلغ (تومان)"
            value={d.txnToman}
            onChange={(e) => d.setTxnToman(e.target.value)}
          />
          <JalaliDateField label="تاریخ" value={d.txnDate} onChange={d.setTxnDate} />
          <SelectField
            label="دسته"
            value={d.txnCategoryId}
            onChange={(e) => d.setTxnCategoryId(e.target.value)}
          >
            <option value="">بدون دسته</option>
            {d.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          label="یادداشت (اختیاری)"
          value={d.txnNote}
          onChange={(e) => d.setTxnNote(e.target.value)}
        />
        <div className="pfRangeRow">
          <SelectField
            label="لینک فضای گروهی (اختیاری)"
            value={d.linkWorkspaceId}
            onChange={(e) => d.setLinkWorkspaceId(e.target.value)}
          >
            <option value="">بدون لینک</option>
            {d.linkWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="خرج گروهی"
            value={d.linkExpenseId}
            onChange={(e) => d.setLinkExpenseId(e.target.value)}
            disabled={!d.linkWorkspaceId}
          >
            <option value="">—</option>
            {d.linkExpenses.map((e) => (
              <option key={e.id} value={e.id}>
                {formatFaDate(e.occurredOn)} · {e.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="تسویه"
            value={d.linkSettlementId}
            onChange={(e) => d.setLinkSettlementId(e.target.value)}
            disabled={!d.linkWorkspaceId}
          >
            <option value="">—</option>
            {d.linkSettlements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8)} · {settlementStatusLabel(s.status)}
              </option>
            ))}
          </SelectField>
        </div>
        <Button
          type="button"
          onClick={d.onCreateTxn}
          disabled={d.pending || d.activeAccounts.length === 0}
        >
          ثبت تراکنش
        </Button>

        <PersonalResourcesTransferForm
          activeAccounts={d.activeAccounts}
          pending={d.pending}
          fromAccountId={d.fromAccountId}
          toAccountId={d.toAccountId}
          transferToman={d.transferToman}
          transferDate={d.transferDate}
          onFromAccountIdChange={d.setFromAccountId}
          onToAccountIdChange={d.setToAccountId}
          onTransferTomanChange={d.setTransferToman}
          onTransferDateChange={d.setTransferDate}
          onTransfer={d.onTransfer}
        />

        <h3 className="pfSubhead">بودجه ماهانه شخصی</h3>
        <div className="pfRangeRow">
          <TextField
            label="ماه (YYYY-MM)"
            value={d.budgetMonth}
            onChange={(e) => d.setBudgetMonth(e.target.value)}
          />
          <TextField
            label="سقف (تومان)"
            value={d.budgetToman}
            onChange={(e) => d.setBudgetToman(e.target.value)}
          />
          <TextField
            label="آستانه هشدار %"
            value={d.budgetAlertPercent}
            onChange={(e) => d.setBudgetAlertPercent(e.target.value)}
          />
          <TextField
            label="یادداشت"
            value={d.budgetNote}
            onChange={(e) => d.setBudgetNote(e.target.value)}
          />
          <Button type="button" onClick={d.onUpsertBudget} disabled={d.pending}>
            ذخیره بودجه
          </Button>
        </div>
        {d.budgets.length > 0 ? (
          <DataList>
            {d.budgets.slice(0, 6).map((b) => (
              <DataRow
                key={b.id}
                title={b.yearMonth}
                meta={
                  <StatusPill
                    tone={
                      b.alertLevel === "exceeded" || b.alertLevel === "warn"
                        ? "warn"
                        : "ok"
                    }
                  >
                    {b.usedPercent}٪ · آستانه {b.alertPercent}٪ · باقیمانده{" "}
                    <Amount irrMinor={b.remaining.amountMinor} />
                    {b.note ? ` · ${b.note}` : ""}
                  </StatusPill>
                }
                trailing={<Amount irrMinor={b.limit.amountMinor} />}
              />
            ))}
          </DataList>
        ) : null}

        <h3 className="pfSubhead">دسته‌های شخصی</h3>
        <div className="pfRangeRow">
          <TextField
            label="نام دسته"
            value={d.categoryName}
            onChange={(e) => d.setCategoryName(e.target.value)}
          />
          <Button type="button" onClick={d.onCreateCategory} disabled={d.pending}>
            افزودن دسته
          </Button>
        </div>
        {d.categories.length > 0 ? (
          <>
            <SelectionActionBar
              selectedCount={categorySel.selectedCount}
              idleHint="روی ردیف کلیک کنید یا مربع کنار دسته را تیک بزنید"
              onClear={categorySel.clear}
            >
              <button
                type="button"
                disabled={!barCategory || d.pending}
                onClick={renameSelectedCategory}
              >
                تغییر نام
              </button>
              <button
                type="button"
                className={selStyles.danger}
                disabled={categorySel.selectedCount === 0 || d.pending}
                onClick={deleteSelectedCategories}
              >
                حذف
              </button>
            </SelectionActionBar>
            <DataList>
              {d.categories.map((c) => (
                <div
                  key={c.id}
                  className={selStyles.selectableRow}
                  {...rowSelectActivateProps({
                    onActivate: () => categorySel.toggle(c.id),
                  })}
                >
                  <DataRow
                    title={
                      <span
                        className="pfRowMeta"
                        style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                      >
                        <RowSelectCheckbox
                          checked={categorySel.isSelected(c.id)}
                          onChange={() => categorySel.toggle(c.id)}
                          label={`انتخاب ${c.name}`}
                        />
                        {c.name}
                      </span>
                    }
                    meta={<span className="pfRowMeta">{c.slug}</span>}
                  />
                </div>
              ))}
            </DataList>
          </>
        ) : (
          <EmptyHint>هنوز دسته‌ای نیست.</EmptyHint>
        )}

        <h3 className="pfSubhead">خروجی CSV</h3>
        <div className="pfRangeRow">
          <JalaliDateField label="از" value={d.exportFrom} onChange={d.setExportFrom} />
          <JalaliDateField label="تا" value={d.exportTo} onChange={d.setExportTo} />
          <Button type="button" onClick={d.onExportTxns} disabled={d.pending}>
            دانلود تراکنش‌ها
          </Button>
        </div>
        {d.exportsList.length > 0 ? (
          <DataList>
            {d.exportsList.map((ex) => (
              <DataRow
                key={ex.id}
                title={`${ex.kind} · ${formatFaDate(ex.from)}→${formatFaDate(ex.to)}`}
                meta={
                  <span className="pfRowMeta">
                    {personalExportStatusLabel(ex.status)} · {ex.rowCount} ردیف
                    {ex.hasFile ? (
                      <>
                        {" · "}
                        <a
                          href={api.downloadPersonalFinanceExportUrl(ex.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          دانلود
                        </a>
                      </>
                    ) : null}
                  </span>
                }
              />
            ))}
          </DataList>
        ) : null}

        <h3 className="pfSubhead">تراکنش‌ها</h3>
        <div className="pfRangeRow">
          <SelectField
            label="فیلتر حساب"
            value={d.txnFilterAccountId}
            onChange={(e) => d.setTxnFilterAccountId(e.target.value)}
          >
            <option value="">همه</option>
            {d.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <JalaliDateField
            label="از"
            value={d.txnFilterFrom}
            onChange={d.setTxnFilterFrom}
          />
          <JalaliDateField label="تا" value={d.txnFilterTo} onChange={d.setTxnFilterTo} />
          <Button type="button" onClick={d.onApplyTxnFilter} disabled={d.pending}>
            اعمال فیلتر
          </Button>
        </div>
        {d.goals.length > 0 ? (
          <SelectField
            label="هدف پس‌انداز برای واریز از تراکنش"
            value={d.contributeGoalId}
            onChange={(e) => d.setContributeGoalId(e.target.value)}
          >
            {d.goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <EmptyHint>برای واریز از تراکنش، ابتدا در عمق مالی شخصی یک هدف بسازید.</EmptyHint>
        )}
        {d.txns.length === 0 ? (
          <EmptyHint>تراکنشی نیست.</EmptyHint>
        ) : (
          <>
            {d.goals.length > 0 ? (
              <SelectionActionBar
                selectedCount={txnSel.selectedCount}
                idleHint="روی ردیف کلیک کنید یا مربع کنار تراکنش را تیک بزنید"
                onClear={txnSel.clear}
              >
                <button
                  type="button"
                  disabled={
                    !barTxn ||
                    d.pending ||
                    !d.contributeGoalId ||
                    (barTxn.kind !== "income" && barTxn.kind !== "expense")
                  }
                  onClick={contributeSelectedTxn}
                >
                  واریز به هدف
                </button>
              </SelectionActionBar>
            ) : null}
            <DataList>
              {d.txns.map((txn) => {
                const canSelect = d.goals.length > 0;
                return (
                <div
                  key={txn.id}
                  className={canSelect ? selStyles.selectableRow : undefined}
                  {...(canSelect
                    ? rowSelectActivateProps({
                        onActivate: () => txnSel.toggle(txn.id),
                      })
                    : {})}
                >
                <DataRow
                  title={
                    canSelect ? (
                      <span
                        className="pfRowMeta"
                        style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                      >
                        <RowSelectCheckbox
                          checked={txnSel.isSelected(txn.id)}
                          onChange={() => txnSel.toggle(txn.id)}
                          label={`انتخاب تراکنش ${txnKindLabel(txn.kind)}`}
                        />
                        {txnKindLabel(txn.kind)}
                      </span>
                    ) : (
                      txnKindLabel(txn.kind)
                    )
                  }
                  meta={
                    <span className="pfRowMeta">
                      {formatFaDate(txn.occurredOn)}
                      {txn.categoryName ? ` · ${txn.categoryName}` : ""}
                      {txn.linkedExpenseId ? " · لینک خرج" : ""}
                      {txn.linkedSettlementId ? " · لینک تسویه" : ""}
                      {txn.note ? ` · ${txn.note}` : ""}
                    </span>
                  }
                  trailing={<Amount irrMinor={txn.amount.amountMinor} />}
                />
                </div>
                );
              })}
            </DataList>
          </>
        )}
      </FormStack>
    </SectionCard>
  );
}
