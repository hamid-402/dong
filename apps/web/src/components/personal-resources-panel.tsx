"use client";

import { newClientId } from "@/lib/id";

import { useEffect, useState, useTransition } from "react";
import type {
  ExpenseSummary,
  PersonalBudgetSummary,
  PersonalCategorySummary,
  PersonalFinanceExportSummary,
  PersonalMoneyAccountKind,
  PersonalMoneyAccountSummary,
  PersonalMoneyTxnSummary,
  PersonalResourcesSummary,
  SettlementSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
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
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function tomanToMinor(toman: string): string {
  const n = Number(toman.replaceAll(",", ""));
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n) * 10);
}

function accountKindLabel(kind: PersonalMoneyAccountKind): string {
  if (kind === "cash") return "نقد";
  if (kind === "bank") return "بانک";
  if (kind === "card") return "کارت";
  return "سایر";
}

function txnKindLabel(kind: string): string {
  if (kind === "income") return "درآمد";
  if (kind === "expense") return "هزینه";
  if (kind === "transfer_in") return "انتقال ورودی";
  if (kind === "transfer_out") return "انتقال خروجی";
  if (kind === "adjustment") return "تعدیل";
  return kind;
}

function budgetAlertText(budget: PersonalBudgetSummary): string | null {
  if (budget.alertLevel === "exceeded") {
    return `بودجه ${budget.yearMonth} تمام شده (${budget.usedPercent}٪ مصرف).`;
  }
  if (budget.alertLevel === "warn") {
    return `هشدار بودجه ${budget.yearMonth}: ${budget.usedPercent}٪ از سقف (آستانه ${budget.alertPercent}٪).`;
  }
  return null;
}

/** Personal wallets / budgets — API-backed only. */
export function PersonalResourcesPanel() {
  const chrome = useAppChrome();
  const [summary, setSummary] = useState<PersonalResourcesSummary | null>(null);
  const [accounts, setAccounts] = useState<PersonalMoneyAccountSummary[]>([]);
  const [txns, setTxns] = useState<PersonalMoneyTxnSummary[]>([]);
  const [budgets, setBudgets] = useState<PersonalBudgetSummary[]>([]);
  const [categories, setCategories] = useState<PersonalCategorySummary[]>([]);
  const [exportsList, setExportsList] = useState<PersonalFinanceExportSummary[]>([]);
  const [linkWorkspaces, setLinkWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [linkExpenses, setLinkExpenses] = useState<ExpenseSummary[]>([]);
  const [linkSettlements, setLinkSettlements] = useState<SettlementSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [accountKind, setAccountKind] = useState<PersonalMoneyAccountKind>("cash");
  const [openingToman, setOpeningToman] = useState("0");
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const [txnAccountId, setTxnAccountId] = useState("");
  const [txnKind, setTxnKind] = useState<"income" | "expense" | "adjustment">("expense");
  const [txnToman, setTxnToman] = useState("");
  const [txnNote, setTxnNote] = useState("");
  const [txnDate, setTxnDate] = useState(todayIso);
  const [txnCategoryId, setTxnCategoryId] = useState("");
  const [linkWorkspaceId, setLinkWorkspaceId] = useState("");
  const [linkExpenseId, setLinkExpenseId] = useState("");
  const [linkSettlementId, setLinkSettlementId] = useState("");

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferToman, setTransferToman] = useState("");
  const [transferDate, setTransferDate] = useState(todayIso);

  const [budgetMonth, setBudgetMonth] = useState(currentYearMonth);
  const [budgetToman, setBudgetToman] = useState("");
  const [budgetAlertPercent, setBudgetAlertPercent] = useState("80");
  const [budgetNote, setBudgetNote] = useState("");

  const [categoryName, setCategoryName] = useState("");
  const [exportFrom, setExportFrom] = useState(monthStart);
  const [exportTo, setExportTo] = useState(todayIso);
  const [txnFilterAccountId, setTxnFilterAccountId] = useState("");
  const [txnFilterFrom, setTxnFilterFrom] = useState(monthStart);
  const [txnFilterTo, setTxnFilterTo] = useState(todayIso);

  async function refresh() {
    const [s, a, t, b, c, e] = await Promise.all([
      api.personalResourcesSummary({ yearMonth: currentYearMonth() }),
      api.listPersonalAccounts(showArchived),
      api.listPersonalTransactions({
        accountId: txnFilterAccountId || undefined,
        from: txnFilterFrom || undefined,
        to: txnFilterTo || undefined,
        limit: 40,
      }),
      api.listPersonalBudgets(),
      api.listPersonalCategories(),
      api.listPersonalFinanceExports(10),
    ]);
    setSummary(s);
    setAccounts(a);
    setTxns(t);
    setBudgets(b);
    setCategories(c);
    setExportsList(e);
    const active = a.filter((x) => !x.archived);
    if (!txnAccountId && active[0]) setTxnAccountId(active[0].id);
    if (!fromAccountId && active[0]) setFromAccountId(active[0].id);
    if (!toAccountId && active[1]) setToAccountId(active[1].id);
  }

  useEffect(() => {
    void refresh()
      .then(() => setError(null))
      .catch((err: unknown) =>
        setError(friendlyErrorMessage(err, "بارگذاری منابع مالی شخصی")),
      );
  }, [showArchived]);

  useEffect(() => {
    if (!chrome.ready) return;
    const spaces = chrome.workspaces.filter(
      (w) => spaceKindForTemplate(w.template) !== "personal",
    );
    setLinkWorkspaces(spaces);
  }, [chrome.ready, chrome.workspaces]);

  useEffect(() => {
    if (!linkWorkspaceId) {
      setLinkExpenses([]);
      setLinkSettlements([]);
      setLinkExpenseId("");
      setLinkSettlementId("");
      return;
    }
    void Promise.all([
      api.listExpenses(linkWorkspaceId),
      api.listSettlements(linkWorkspaceId),
    ])
      .then(([expenses, settlements]) => {
        setLinkExpenses(expenses.filter((e) => e.status === "posted"));
        setLinkSettlements(settlements);
      })
      .catch(() => {
        setLinkExpenses([]);
        setLinkSettlements([]);
      });
  }, [linkWorkspaceId]);

  function run(label: string, work: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await work();
          setError(null);
          setInfo(label);
          await refresh();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, label));
        }
      })();
    });
  }

  function onCreateAccount() {
    const openingMinor = tomanToMinor(openingToman || "0");
    if (!accountName.trim()) {
      setError("نام حساب لازم است");
      return;
    }
    if (!openingMinor && openingToman.trim() !== "0") {
      setError("موجودی اولیه نامعتبر است");
      return;
    }
    run("حساب ساخته شد", async () => {
      await api.createPersonalAccount({
        name: accountName.trim(),
        kind: accountKind,
        openingBalance: { amountMinor: openingMinor || "0", currency: "IRR" },
        idempotencyKey: newClientId(),
      });
      setAccountName("");
      setOpeningToman("0");
    });
  }

  function onRenameAccount() {
    if (!renameId || !renameValue.trim()) {
      setError("نام جدید لازم است");
      return;
    }
    run("نام حساب به‌روز شد", async () => {
      await api.updatePersonalAccount(renameId, { name: renameValue.trim() });
      setRenameId("");
      setRenameValue("");
    });
  }

  function onToggleArchive(account: PersonalMoneyAccountSummary) {
    run(account.archived ? "حساب از بایگانی خارج شد" : "حساب بایگانی شد", async () => {
      await api.updatePersonalAccount(account.id, { archived: !account.archived });
    });
  }

  function onCreateTxn() {
    const minor = tomanToMinor(txnToman);
    if (!txnAccountId) {
      setError("حساب را انتخاب کنید");
      return;
    }
    if (!minor || minor === "0") {
      setError("مبلغ نامعتبر است");
      return;
    }
    run("تراکنش ثبت شد", async () => {
      await api.createPersonalTransaction({
        accountId: txnAccountId,
        kind: txnKind,
        amount: { amountMinor: minor, currency: "IRR" },
        occurredOn: txnDate,
        note: txnNote.trim() || undefined,
        categoryId: txnCategoryId || undefined,
        linkedWorkspaceId: linkWorkspaceId || undefined,
        linkedExpenseId: linkExpenseId || undefined,
        linkedSettlementId: linkSettlementId || undefined,
        idempotencyKey: newClientId(),
      });
      setTxnToman("");
      setTxnNote("");
      setLinkExpenseId("");
      setLinkSettlementId("");
    });
  }

  function onTransfer() {
    const minor = tomanToMinor(transferToman);
    if (!fromAccountId || !toAccountId) {
      setError("حساب مبدأ و مقصد لازم است");
      return;
    }
    if (!minor || minor === "0") {
      setError("مبلغ انتقال نامعتبر است");
      return;
    }
    run("انتقال ثبت شد", async () => {
      await api.createPersonalTransfer({
        fromAccountId,
        toAccountId,
        amount: { amountMinor: minor, currency: "IRR" },
        occurredOn: transferDate,
        idempotencyKey: newClientId(),
      });
      setTransferToman("");
    });
  }

  function onUpsertBudget() {
    const minor = tomanToMinor(budgetToman);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(budgetMonth)) {
      setError("ماه نامعتبر است (YYYY-MM)");
      return;
    }
    if (!minor || minor === "0") {
      setError("سقف بودجه نامعتبر است");
      return;
    }
    const alertPct = Number(budgetAlertPercent);
    if (!Number.isFinite(alertPct) || alertPct < 1 || alertPct > 100) {
      setError("آستانه هشدار باید بین ۱ تا ۱۰۰ باشد");
      return;
    }
    run("بودجه ذخیره شد", async () => {
      await api.upsertPersonalBudget({
        yearMonth: budgetMonth,
        limit: { amountMinor: minor, currency: "IRR" },
        alertPercent: Math.floor(alertPct),
        note: budgetNote.trim() || undefined,
        idempotencyKey: newClientId(),
      });
      setBudgetToman("");
      setBudgetNote("");
    });
  }

  function onCreateCategory() {
    if (!categoryName.trim()) {
      setError("نام دسته لازم است");
      return;
    }
    run("دسته افزوده شد", async () => {
      await api.createPersonalCategory({
        name: categoryName.trim(),
        idempotencyKey: newClientId(),
      });
      setCategoryName("");
    });
  }

  function onDeleteCategory(categoryId: string) {
    run("دسته حذف شد", async () => {
      await api.deletePersonalCategory(categoryId);
    });
  }

  function onExportTxns() {
    run("خروجی تراکنش‌ها", async () => {
      const created = await api.createPersonalFinanceExport({
        from: exportFrom,
        to: exportTo,
        kind: "transactions",
        idempotencyKey: newClientId(),
      });
      if (!created.hasFile) throw new Error(created.errorDetail || "فایل آماده نشد");
      window.open(api.downloadPersonalFinanceExportUrl(created.id), "_blank");
    });
  }

  function onApplyTxnFilter() {
    run("فیلتر اعمال شد", async () => {
      /* refresh() already uses filters */
    });
  }

  const activeAccounts = accounts.filter((a) => !a.archived);

  return (
    <SectionCard title="منابع مالی شخصی" delayClass="delay1">
      <FormStack>
        <StatusLine>
          حساب‌های نقد/کارت شما — جدا از مانده گروهی. لینک به خرج/تسویه فقط با انتخاب صریح.
        </StatusLine>
        {summary ? (
          <div className="pfTotals">
            <div>
              <span className="pfTotalsLabel">جمع موجودی حساب‌های فعال</span>
              <Amount irrMinor={summary.totalBalance.amountMinor} />
            </div>
            <div>
              <span className="pfTotalsLabel">حساب‌های فعال</span>
              <strong>{summary.activeAccountCount}</strong>
              <span className="pfRowMeta">
                {" "}
                · ذخیره: {summary.persistence === "postgres" ? "Postgres" : "حافظه"}
              </span>
            </div>
            {summary.currentMonthBudget ? (
              <div>
                <span className="pfTotalsLabel">
                  بودجه {summary.currentMonthBudget.yearMonth}
                </span>
                <div>
                  مانده بودجه:{" "}
                  <Amount irrMinor={summary.currentMonthBudget.remaining.amountMinor} />
                </div>
                <span className="pfRowMeta">
                  سقف <Amount irrMinor={summary.currentMonthBudget.limit.amountMinor} /> ·
                  خرج شخصی <Amount irrMinor={summary.currentMonthBudget.spent.amountMinor} />
                  {summary.currentMonthBudget.note
                    ? ` · ${summary.currentMonthBudget.note}`
                    : ""}
                </span>
              </div>
            ) : (
              <div>
                <span className="pfTotalsLabel">بودجه ماه جاری</span>
                <span className="pfRowMeta">هنوز تعریف نشده</span>
              </div>
            )}
          </div>
        ) : null}

        {error ? <p className="liveError">{error}</p> : null}
        {info ? <p className="liveSuccess">{info}</p> : null}
        {summary?.currentMonthBudget
          ? (() => {
              const alert = budgetAlertText(summary.currentMonthBudget);
              if (!alert) return null;
              return (
                <p
                  className={
                    summary.currentMonthBudget.alertLevel === "exceeded"
                      ? "liveError"
                      : "pfBudgetWarn"
                  }
                >
                  {alert}
                </p>
              );
            })()
          : null}

        <h3 className="pfSubhead">حساب‌ها</h3>
        <label className="pfCheck">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          نمایش بایگانی‌شده‌ها
        </label>
        {accounts.length === 0 ? (
          <EmptyHint>هنوز حسابی نساخته‌اید.</EmptyHint>
        ) : (
          <DataList>
            {accounts.map((account) => (
              <DataRow
                key={account.id}
                title={account.name}
                meta={
                  <span className="pfRowMeta">
                    {accountKindLabel(account.kind)}
                    {account.archived ? " · بایگانی" : ""}
                    {" · "}
                    <button
                      type="button"
                      className="pfTextBtn"
                      onClick={() => {
                        setRenameId(account.id);
                        setRenameValue(account.name);
                      }}
                    >
                      تغییر نام
                    </button>
                    {" · "}
                    <button
                      type="button"
                      className="pfTextBtn"
                      onClick={() => onToggleArchive(account)}
                      disabled={pending}
                    >
                      {account.archived ? "خروج از بایگانی" : "بایگانی"}
                    </button>
                  </span>
                }
                trailing={<Amount irrMinor={account.balance.amountMinor} />}
              />
            ))}
          </DataList>
        )}

        {renameId ? (
          <div className="pfRangeRow">
            <TextField
              label="نام جدید"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <Button type="button" onClick={onRenameAccount} disabled={pending}>
              ذخیره نام
            </Button>
            <Button
              type="button"
              onClick={() => {
                setRenameId("");
                setRenameValue("");
              }}
            >
              انصراف
            </Button>
          </div>
        ) : null}

        <div className="pfRangeRow">
          <TextField
            label="نام حساب"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          <SelectField
            label="نوع"
            value={accountKind}
            onChange={(e) => setAccountKind(e.target.value as PersonalMoneyAccountKind)}
          >
            <option value="cash">نقد</option>
            <option value="bank">بانک</option>
            <option value="card">کارت</option>
            <option value="other">سایر</option>
          </SelectField>
          <TextField
            label="موجودی اولیه (تومان)"
            value={openingToman}
            onChange={(e) => setOpeningToman(e.target.value)}
          />
          <Button type="button" onClick={onCreateAccount} disabled={pending}>
            افزودن حساب
          </Button>
        </div>

        <h3 className="pfSubhead">ثبت تراکنش</h3>
        <div className="pfRangeRow">
          <SelectField
            label="حساب"
            value={txnAccountId}
            onChange={(e) => setTxnAccountId(e.target.value)}
          >
            <option value="">انتخاب…</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="نوع"
            value={txnKind}
            onChange={(e) =>
              setTxnKind(e.target.value as "income" | "expense" | "adjustment")
            }
          >
            <option value="expense">هزینه</option>
            <option value="income">درآمد</option>
            <option value="adjustment">تعدیل (افزایش)</option>
          </SelectField>
          <TextField
            label="مبلغ (تومان)"
            value={txnToman}
            onChange={(e) => setTxnToman(e.target.value)}
          />
          <JalaliDateField label="تاریخ" value={txnDate} onChange={setTxnDate} />
          <SelectField
            label="دسته"
            value={txnCategoryId}
            onChange={(e) => setTxnCategoryId(e.target.value)}
          >
            <option value="">بدون دسته</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          label="یادداشت (اختیاری)"
          value={txnNote}
          onChange={(e) => setTxnNote(e.target.value)}
        />
        <div className="pfRangeRow">
          <SelectField
            label="لینک فضای گروهی (اختیاری)"
            value={linkWorkspaceId}
            onChange={(e) => setLinkWorkspaceId(e.target.value)}
          >
            <option value="">بدون لینک</option>
            {linkWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="خرج گروهی"
            value={linkExpenseId}
            onChange={(e) => setLinkExpenseId(e.target.value)}
            disabled={!linkWorkspaceId}
          >
            <option value="">—</option>
            {linkExpenses.map((e) => (
              <option key={e.id} value={e.id}>
                {e.occurredOn} · {e.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="تسویه"
            value={linkSettlementId}
            onChange={(e) => setLinkSettlementId(e.target.value)}
            disabled={!linkWorkspaceId}
          >
            <option value="">—</option>
            {linkSettlements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8)} · {s.status}
              </option>
            ))}
          </SelectField>
        </div>
        <Button type="button" onClick={onCreateTxn} disabled={pending || activeAccounts.length === 0}>
          ثبت تراکنش
        </Button>

        <h3 className="pfSubhead">انتقال بین حساب‌ها</h3>
        <div className="pfRangeRow">
          <SelectField
            label="از"
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="به"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="مبلغ (تومان)"
            value={transferToman}
            onChange={(e) => setTransferToman(e.target.value)}
          />
          <JalaliDateField label="تاریخ" value={transferDate} onChange={setTransferDate} />
          <Button
            type="button"
            onClick={onTransfer}
            disabled={pending || activeAccounts.length < 2}
          >
            انتقال
          </Button>
        </div>

        <h3 className="pfSubhead">بودجه ماهانه شخصی</h3>
        <div className="pfRangeRow">
          <TextField
            label="ماه (YYYY-MM)"
            value={budgetMonth}
            onChange={(e) => setBudgetMonth(e.target.value)}
          />
          <TextField
            label="سقف (تومان)"
            value={budgetToman}
            onChange={(e) => setBudgetToman(e.target.value)}
          />
          <TextField
            label="آستانه هشدار %"
            value={budgetAlertPercent}
            onChange={(e) => setBudgetAlertPercent(e.target.value)}
          />
          <TextField
            label="یادداشت"
            value={budgetNote}
            onChange={(e) => setBudgetNote(e.target.value)}
          />
          <Button type="button" onClick={onUpsertBudget} disabled={pending}>
            ذخیره بودجه
          </Button>
        </div>
        {budgets.length > 0 ? (
          <DataList>
            {budgets.slice(0, 6).map((b) => (
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
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <Button type="button" onClick={onCreateCategory} disabled={pending}>
            افزودن دسته
          </Button>
        </div>
        {categories.length > 0 ? (
          <DataList>
            {categories.map((c) => (
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
                        run("دسته به‌روز شد", async () => {
                          await api.updatePersonalCategory(c.id, { name: next.trim() });
                        });
                      }}
                      disabled={pending}
                    >
                      تغییر نام
                    </button>
                    {" · "}
                    <button
                      type="button"
                      className="pfTextBtn"
                      onClick={() => onDeleteCategory(c.id)}
                      disabled={pending}
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
          <JalaliDateField label="از" value={exportFrom} onChange={setExportFrom} />
          <JalaliDateField label="تا" value={exportTo} onChange={setExportTo} />
          <Button type="button" onClick={onExportTxns} disabled={pending}>
            دانلود تراکنش‌ها
          </Button>
        </div>
        {exportsList.length > 0 ? (
          <DataList>
            {exportsList.map((ex) => (
              <DataRow
                key={ex.id}
                title={`${ex.kind} · ${ex.from}→${ex.to}`}
                meta={
                  <span className="pfRowMeta">
                    {ex.status} · {ex.rowCount} ردیف
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
            value={txnFilterAccountId}
            onChange={(e) => setTxnFilterAccountId(e.target.value)}
          >
            <option value="">همه</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <JalaliDateField label="از" value={txnFilterFrom} onChange={setTxnFilterFrom} />
          <JalaliDateField label="تا" value={txnFilterTo} onChange={setTxnFilterTo} />
          <Button type="button" onClick={onApplyTxnFilter} disabled={pending}>
            اعمال فیلتر
          </Button>
        </div>
        {txns.length === 0 ? (
          <EmptyHint>تراکنشی نیست.</EmptyHint>
        ) : (
          <DataList>
            {txns.map((txn) => (
              <DataRow
                key={txn.id}
                title={txnKindLabel(txn.kind)}
                meta={
                  <span className="pfRowMeta">
                    {txn.occurredOn}
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
