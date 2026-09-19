"use client";

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
              d.setTxnKind(e.target.value as "income" | "expense" | "adjustment")
            }
          >
            <option value="expense">هزینه</option>
            <option value="income">درآمد</option>
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
          <DataList>
            {d.categories.map((c) => (
              <DataRow
                key={c.id}
                title={c.name}
                meta={
                  <span className="pfRowMeta">
                    {c.slug} ·{" "}
                    <button
                      type="button"
                      className="pfTextBtn"
                      onClick={() => {
                        const next = window.prompt("نام جدید دسته", c.name);
                        if (!next?.trim()) return;
                        d.run("دسته به‌روز شد", async () => {
                          await api.updatePersonalCategory(c.id, { name: next.trim() });
                        });
                      }}
                      disabled={d.pending}
                    >
                      تغییر نام
                    </button>
                    {" · "}
                    <button
                      type="button"
                      className="pfTextBtn"
                      onClick={() => d.onDeleteCategory(c.id)}
                      disabled={d.pending}
                    >
                      حذف
                    </button>
                  </span>
                }
              />
            ))}
          </DataList>
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
        {d.txns.length === 0 ? (
          <EmptyHint>تراکنشی نیست.</EmptyHint>
        ) : (
          <DataList>
            {d.txns.map((txn) => (
              <DataRow
                key={txn.id}
                title={txnKindLabel(txn.kind)}
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
            ))}
          </DataList>
        )}
      </FormStack>
    </SectionCard>
  );
}
