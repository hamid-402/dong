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
  SavingsGoalSummary,
  SettlementSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { spaceKindForTemplate, currentJalaliYearMonth } from "@dang/contracts";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentYearMonth(): string {
  return currentJalaliYearMonth();
}

export function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function tomanToMinor(toman: string): string {
  const n = Number(toman.replaceAll(",", ""));
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n) * 10);
}

export function accountKindLabel(kind: PersonalMoneyAccountKind): string {
  if (kind === "cash") return "نقد";
  if (kind === "bank") return "بانک";
  if (kind === "card") return "کارت";
  if (kind === "investment") return "سرمایه‌گذاری";
  return "سایر";
}

export function txnKindLabel(kind: string): string {
  if (kind === "income") return "درآمد";
  if (kind === "expense") return "هزینه";
  if (kind === "transfer_in") return "انتقال ورودی";
  if (kind === "transfer_out") return "انتقال خروجی";
  if (kind === "adjustment") return "تعدیل";
  if (kind === "investment") return "سرمایه‌گذاری";
  if (kind === "installment") return "قسط";
  return kind;
}

export function budgetAlertText(budget: PersonalBudgetSummary): string | null {
  if (budget.alertLevel === "exceeded") {
    return `بودجه ${budget.yearMonth} تمام شده (${budget.usedPercent}٪ مصرف).`;
  }
  if (budget.alertLevel === "warn") {
    return `هشدار بودجه ${budget.yearMonth}: ${budget.usedPercent}٪ از سقف (آستانه ${budget.alertPercent}٪).`;
  }
  return null;
}

/** State + API actions for personal wallets / budgets. */
export function usePersonalResourcesData() {
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
  const [txnKind, setTxnKind] = useState<"income" | "expense" | "adjustment" | "investment" | "installment">("expense");
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
  const [goals, setGoals] = useState<SavingsGoalSummary[]>([]);
  const [contributeGoalId, setContributeGoalId] = useState("");

  async function refresh() {
    const [s, a, t, b, c, e, g] = await Promise.all([
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
      api.listSavingsGoals().catch(() => [] as SavingsGoalSummary[]),
    ]);
    setSummary(s);
    setAccounts(a);
    setTxns(t);
    setBudgets(b);
    setCategories(c);
    setExportsList(e);
    setGoals(g);
    const active = a.filter((x) => !x.archived);
    if (!txnAccountId && active[0]) setTxnAccountId(active[0].id);
    if (!fromAccountId && active[0]) setFromAccountId(active[0].id);
    if (!toAccountId && active[1]) setToAccountId(active[1].id);
    if (!contributeGoalId && g[0]) setContributeGoalId(g[0].id);
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

  function onContributeTxnToGoal(txn: PersonalMoneyTxnSummary) {
    if (!contributeGoalId) {
      setError("ابتدا یک هدف پس‌انداز بسازید یا انتخاب کنید");
      return;
    }
    if (txn.kind !== "income" && txn.kind !== "expense") {
      setError("فقط تراکنش درآمد/خرج به هدف واریز می‌شود");
      return;
    }
    run("واریز از تراکنش ثبت شد", async () => {
      await api.addSavingsGoalContribution(contributeGoalId, {
        amountMinor: txn.amount.amountMinor,
        occurredAt: `${txn.occurredOn}T12:00:00.000Z`,
        txnId: txn.id,
        note: txn.note?.trim() || `از تراکنش ${txn.kind}`,
        idempotencyKey: newClientId(),
      });
    });
  }

  const activeAccounts = accounts.filter((a) => !a.archived);

  return {
    summary,
    accounts,
    activeAccounts,
    txns,
    budgets,
    categories,
    exportsList,
    goals,
    contributeGoalId,
    setContributeGoalId,
    onContributeTxnToGoal,
    linkWorkspaces,
    linkExpenses,
    linkSettlements,
    error,
    info,
    pending,
    showArchived,
    setShowArchived,
    accountName,
    setAccountName,
    accountKind,
    setAccountKind,
    openingToman,
    setOpeningToman,
    renameId,
    setRenameId,
    renameValue,
    setRenameValue,
    txnAccountId,
    setTxnAccountId,
    txnKind,
    setTxnKind,
    txnToman,
    setTxnToman,
    txnNote,
    setTxnNote,
    txnDate,
    setTxnDate,
    txnCategoryId,
    setTxnCategoryId,
    linkWorkspaceId,
    setLinkWorkspaceId,
    linkExpenseId,
    setLinkExpenseId,
    linkSettlementId,
    setLinkSettlementId,
    fromAccountId,
    setFromAccountId,
    toAccountId,
    setToAccountId,
    transferToman,
    setTransferToman,
    transferDate,
    setTransferDate,
    budgetMonth,
    setBudgetMonth,
    budgetToman,
    setBudgetToman,
    budgetAlertPercent,
    setBudgetAlertPercent,
    budgetNote,
    setBudgetNote,
    categoryName,
    setCategoryName,
    exportFrom,
    setExportFrom,
    exportTo,
    setExportTo,
    txnFilterAccountId,
    setTxnFilterAccountId,
    txnFilterFrom,
    setTxnFilterFrom,
    txnFilterTo,
    setTxnFilterTo,
    run,
    onCreateAccount,
    onRenameAccount,
    onToggleArchive,
    onCreateTxn,
    onTransfer,
    onUpsertBudget,
    onCreateCategory,
    onDeleteCategory,
    onExportTxns,
    onApplyTxnFilter,
    onContributeTxnToGoal,
  };
}
