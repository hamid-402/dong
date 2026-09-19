"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CostCenterSummary, ExpensePeriodSummary, ExpenseSummary, JournalEntrySummary, MemberInvoiceAdjustmentSummary, MemberInvoiceSummary, MembershipSummary, PaymentLinkSummary, PeriodKind, PettyCashFundSummary, SettlementSummary, SplitMethod, WorkspaceBalancesResponse } from "@dang/contracts";
import {
  isFinanceManagerRole,
  isReadOnlyRole,
  spaceKindForTemplate,
} from "@dang/contracts";
import { Button, TextField, formatToman } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  emptySplitComposer,
  splitComposerFromExpense,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  EmptyHint,
  FormStack,
  HeroBalance,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { GroupOpsRail } from "@/components/shell/group-ops-rail";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity, type AuditEventDto } from "@/lib/api";
import { WorkspaceReportsPanel } from "@/components/workspace-reports-panel";
import { hubPathFor } from "@/lib/hub-links";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  readUnitPrefillFromUrl,
  titleForUnitPrefill,
} from "@/lib/expense-unit-href";
import { irrMinorToTomanInput } from "@/lib/irr-money";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import { membershipRoleLabel, zeroSumHint } from "@/lib/status-labels";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { FlashMessages } from "@/lib/use-flash-message";
import {
  listOfflineExpenseDrafts,
  type OfflineExpenseDraft,
} from "@/lib/offline-drafts";
import { FinanceSummaryCard } from "@/components/views/finance/finance-summary-card";
import { ExpenseListPanel } from "@/components/views/finance/expense-list-panel";
import { LedgerAuditPanels } from "@/components/views/finance/ledger-audit-panels";
import { PeriodInvoicePanels } from "@/components/views/finance/period-invoice-panels";
import { ExpenseFormPanel } from "@/components/views/finance/expense-form-panel";
import { SettlementPanel } from "@/components/views/finance/settlement-panel";
import { DebtSimplifyPanel } from "@/components/views/friends-group/debt-simplify-panel";
import {
  loadWorkspaceData,
  type FinanceSection,
  type FinanceWorkspaceData,
} from "@/components/views/finance/use-finance-data";
import { useFinanceActions } from "@/components/views/finance/use-finance-actions";
import {
  expenseQueryFromState,
  readExpenseSearchFromUrl,
  syncExpenseQueryUrl,
  type ExpenseFilter,
} from "@/components/views/finance/expense-list-query";
import { usePathname, useRouter } from "next/navigation";
import { newClientId } from "@/lib/id";

function readSettleToFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("settleTo")?.trim() ?? "";
}

function readSettleAmountFromUrl(): string {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("settleAmount")?.trim() ?? "";
  return /^\d+$/.test(raw) ? raw : "";
}

function readExpenseIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("expense")?.trim() ?? "";
}

export type { FinanceSection };

export function FinanceView({
  section = "expenses",
  focusPanel,
}: {
  /** Real destination — only that section’s panels render. */
  section?: FinanceSection;
  /** @deprecated Prefer `section`; kept for hash scroll inside a section. */
  focusPanel?: "expense" | "settlement" | "invoice" | "reports";
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const selectedId = scope?.workspaceId || chrome.workspaceId;
  const workspaces = chrome.workspaces;
  const session = chrome.session;
  const capabilities = chrome.capabilities;
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [settlements, setSettlements] = useState<SettlementSummary[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkSummary[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriodSummary[]>([]);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [invoices, setInvoices] = useState<MemberInvoiceSummary[]>([]);
  const [invoiceAdjustments, setInvoiceAdjustments] = useState<
    MemberInvoiceAdjustmentSummary[]
  >([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<JournalEntrySummary[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
  const [devSubject, setDevSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [devDisplayName, setDevDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [title, setTitle] = useState(() => {
    const unit = readUnitPrefillFromUrl();
    return unit ? titleForUnitPrefill(unit) : "";
  });
  const [amountToman, setAmountToman] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [split, setSplit] = useState<SplitComposerValue>(() => emptySplitComposer("shared"));
  const initialExpenseSearch = readExpenseSearchFromUrl();
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>(
    () => initialExpenseSearch.filter,
  );
  const [expenseFrom, setExpenseFrom] = useState(() => initialExpenseSearch.from);
  const [expenseTo, setExpenseTo] = useState(() => initialExpenseSearch.to);
  const [expenseCatalogItemId, setExpenseCatalogItemId] = useState(
    () => initialExpenseSearch.catalogItemId,
  );
  const [expenseSearchQ, setExpenseSearchQ] = useState(() => initialExpenseSearch.q);
  const [expensePaidByUserId, setExpensePaidByUserId] = useState(
    () => initialExpenseSearch.paidByUserId,
  );
  const [expenseCategoryId, setExpenseCategoryId] = useState(
    () => initialExpenseSearch.categoryId,
  );
  const [expenseTagId, setExpenseTagId] = useState(() => initialExpenseSearch.tagId);
  const [categoryFilterOptions, setCategoryFilterOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [tagFilterOptions, setTagFilterOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [splitPresets, setSplitPresets] = useState<
    Array<{
      id: string;
      name: string;
      splitMethod: SplitMethod;
      lines: Array<{ userId: string; shares?: number; percentBp?: number; amountMinor?: string }>;
    }>
  >([]);
  const [catalogFilterOptions, setCatalogFilterOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [expensePeriodId, setExpensePeriodId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [costCenters, setCostCenters] = useState<CostCenterSummary[]>([]);
  const [requireCostCenter, setRequireCostCenter] = useState(false);
  const [missionKind, setMissionKind] = useState<"" | "advance" | "settlement">("");
  const [revisingExpenseId, setRevisingExpenseId] = useState<string | null>(null);
  const [reviseReason, setReviseReason] = useState("");
  const [fundingSourceKind, setFundingSourceKind] = useState<
    "" | "personal" | "petty_cash"
  >("");
  const [fundingRefId, setFundingRefId] = useState("");
  const [pettyCashFunds, setPettyCashFunds] = useState<PettyCashFundSummary[]>([]);
  const [settleToUserId, setSettleToUserId] = useState(() => readSettleToFromUrl());
  const [settleAmountToman, setSettleAmountToman] = useState(() => readSettleAmountFromUrl());
  const [initialExpenseId] = useState(() => readExpenseIdFromUrl());
  const settlePrefillDone = useRef(Boolean(readSettleAmountFromUrl()));
  const [periodTitle, setPeriodTitle] = useState("هفته جاری");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("week");
  const [periodStartsOn, setPeriodStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodEndsOn, setPeriodEndsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineExpenseDraft[]>([]);
  /** Real timestamp of last successful offline draft save (dong-50 #37). */
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  /** Show optional post-settlement satisfaction prompt after a real confirm (dong-50 #40). */
  const [settlementNps, setSettlementNps] = useState(false);
  const paymentsLive =
    capabilities?.providers?.payment === "zarinpal" ||
    capabilities?.providers?.payment === "local_psp";
  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 4000);
  }
  function applyWorkspaceData(data: FinanceWorkspaceData) {
    setExpenses(data.expenses);
    setSettlements(data.settlements);
    setPaymentLinks(data.paymentLinks);
    setPeriods(data.periods);
    setPeriodsError(data.periodsError);
    setSelectedPeriodId(data.activePeriodId);
    setInvoices(data.invoices);
    setInvoiceAdjustments(data.invoiceAdjustments);
    setAuditEvents(data.auditEvents);
    setMembers(data.members);
    setBalances(data.balances);
    setLedgerEntries(data.ledgerEntries);
    setExpensePeriodId((prev) => {
      if (prev && data.periods.some((p) => p.id === prev)) return prev;
      return data.activePeriodId;
    });
    setSplit((prev) => {
      const valid = new Set(data.members.map((member) => member.userId));
      const kept = prev.participantUserIds.filter((id) => valid.has(id));
      return {
        ...prev,
        participantUserIds:
          kept.length > 0 ? kept : data.members.map((member) => member.userId),
      };
    });
    setSettleToUserId((prev) => {
      if (prev && data.members.some((member) => member.userId === prev)) return prev;
      return (
        data.members.find((member) => member.userId !== data.members[0]?.userId)?.userId ??
        data.members[0]?.userId ??
        ""
      );
    });
  }
  function refresh() {
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(devSubject.trim() || "dev-local-user", devDisplayName.trim() || "کاربر محلی");
          if (selectedId) {
            applyWorkspaceData(
              await loadWorkspaceData(
                selectedId,
                selectedPeriodId,
                expenseQueryFromState({
                  filter: expenseFilter,
                  from: expenseFrom,
                  to: expenseTo,
                  catalogItemId: expenseCatalogItemId,
                  q: expenseSearchQ,
                  paidByUserId: expensePaidByUserId,
                  categoryId: expenseCategoryId,
                  tagId: expenseTagId,
                }),
                section,
              ),
            );
            setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
          } else {
            setExpenses([]);
            setSettlements([]);
            setPaymentLinks([]);
            setPeriods([]);
            setPeriodsError(null);
            setSelectedPeriodId("");
            setInvoices([]);
            setAuditEvents([]);
            setMembers([]);
            setBalances(null);
            setLedgerEntries([]);
            setOfflineDrafts([]);
          }
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  useEffect(() => {
    let cancelled = false;
    if (!chrome.ready || !selectedId) {
      if (chrome.ready && !selectedId) setInitialLoading(false);
      return;
    }
    void (async () => {
      try {
        const identity = getDevIdentity();
        setDevSubject(identity.subject);
        setDevDisplayName(identity.displayName);
        setDevIdentity(identity.subject, identity.displayName);
        applyWorkspaceData(
          await loadWorkspaceData(
            selectedId,
            undefined,
            expenseQueryFromState({
              filter: expenseFilter,
              from: expenseFrom,
              to: expenseTo,
              catalogItemId: expenseCatalogItemId,
              q: expenseSearchQ,
              paidByUserId: expensePaidByUserId,
              categoryId: expenseCategoryId,
              tagId: expenseTagId,
            }),
            section,
          ),
        );
        if (!cancelled) setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
        if (
          !cancelled &&
          chrome.capabilities?.productFlags?.costCenter
        ) {
          const centers = await api.listCostCenters(selectedId).catch(() => []);
          if (!cancelled) {
            setCostCenters(centers.filter((c) => c.active));
            setCostCenterId("");
          }
        } else if (!cancelled) {
          setCostCenters([]);
          setCostCenterId("");
        }
        if (!cancelled && chrome.capabilities?.productFlags?.expensePolicy) {
          const pol = await api.getExpensePolicy(selectedId).catch(() => null);
          if (!cancelled) setRequireCostCenter(Boolean(pol?.requireCostCenter));
        } else if (!cancelled) {
          setRequireCostCenter(false);
        }
        setMissionKind("");
        if (
          !cancelled &&
          chrome.capabilities?.providers?.pettyCash === "fund_v1"
        ) {
          const funds = await api.listPettyCash(selectedId).catch(() => []);
          if (!cancelled) {
            setPettyCashFunds(funds.filter((f) => f.active));
          }
        } else if (!cancelled) {
          setPettyCashFunds([]);
          setFundingSourceKind("");
          setFundingRefId("");
        }
        if (
          !cancelled &&
          chrome.capabilities?.providers?.catalog === "catalog_v1"
        ) {
          const page = await api
            .listCatalogItems(selectedId, { activeOnly: true, limit: 100 })
            .catch(() => null);
          if (!cancelled) {
            setCatalogFilterOptions(
              (page?.items ?? []).map((item) => ({ id: item.id, name: item.name })),
            );
          }
        } else if (!cancelled) {
          setCatalogFilterOptions([]);
          setExpenseCatalogItemId("");
        }
        if (!cancelled) {
          const cats = await api.listCategories(selectedId).catch(() => []);
          if (!cancelled) {
            setCategoryFilterOptions(cats.map((c) => ({ id: c.id, name: c.name })));
          }
        }
        if (!cancelled) {
          const tags = await api.listExpenseTags(selectedId).catch(() => []);
          if (!cancelled) {
            setTagFilterOptions(tags.map((t) => ({ id: t.id, name: t.name })));
          }
        }
        if (!cancelled) {
          const presets = await api.listSplitPresets(selectedId).catch(() => []);
          if (!cancelled) {
            setSplitPresets(
              presets.map((p) => ({
                id: p.id,
                name: p.name,
                splitMethod: p.splitMethod,
                lines: p.lines,
              })),
            );
          }
        }
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Filter changes re-fetch via dedicated effect below.
  }, [chrome.ready, selectedId, section]);

  useEffect(() => {
    if (!selectedId || !chrome.ready || section !== "expenses") return;
    syncExpenseQueryUrl(
      pathname,
      {
        filter: expenseFilter,
        from: expenseFrom,
        to: expenseTo,
        catalogItemId: expenseCatalogItemId,
        q: expenseSearchQ,
        paidByUserId: expensePaidByUserId,
        categoryId: expenseCategoryId,
        tagId: expenseTagId,
      },
      (href) => router.replace(href, { scroll: false }),
    );
    startTransition(() => {
      void api
        .listExpenses(
          selectedId,
          expenseQueryFromState({
            filter: expenseFilter,
            from: expenseFrom,
            to: expenseTo,
            catalogItemId: expenseCatalogItemId,
            q: expenseSearchQ,
            paidByUserId: expensePaidByUserId,
            categoryId: expenseCategoryId,
            tagId: expenseTagId,
          }),
        )
        .then((rows) => setExpenses(rows))
        .catch((err: unknown) => setError(friendlyErrorMessage(err, "بارگذاری خرج‌ها ناموفق بود")));
    });
  }, [
    expenseFilter,
    expenseFrom,
    expenseTo,
    expenseCatalogItemId,
    expenseSearchQ,
    expensePaidByUserId,
    expenseCategoryId,
    expenseTagId,
    selectedId,
    chrome.ready,
    section,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (settlePrefillDone.current || !balances || !settleToUserId || settleAmountToman) return;
    const line = balances.lines.find((l) => l.userId === settleToUserId);
    if (!line) return;
    const toman = Math.abs(Math.round(Number(line.net.amountMinor) / 10));
    if (toman <= 0) return;
    setSettleAmountToman(String(toman));
    settlePrefillDone.current = true;
  }, [balances, settleToUserId, settleAmountToman]);

  useEffect(() => {
    if (initialLoading || !selectedId) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const activeSlug = workspaces.find((w) => w.id === selectedId)?.slug ?? null;
    const wantSettlement =
      focusPanel === "settlement" || hash === "#settlement-panel";
    const wantExpense =
      focusPanel === "expense" ||
      hash === "#expense-panel" ||
      hash === "#quick-expense";
    const wantInvoice =
      focusPanel === "invoice" || hash === "#period-invoice-panel";
    const wantReports =
      focusPanel === "reports" || hash === "#reports-panel";

    // Compatibility: classic `/workspaces#…` bookmarks may land on the wrong finance section.
    if (activeSlug) {
      if (wantSettlement && section !== "settlements") {
        router.replace(`${wPath(activeSlug, "settlements")}${hash || "#settlement-panel"}`);
        return;
      }
      if (wantInvoice && section !== "invoices") {
        router.replace(`${wPath(activeSlug, "invoices")}${hash || "#period-invoice-panel"}`);
        return;
      }
      if (wantReports && section !== "recurring") {
        router.replace(`${wPath(activeSlug, "recurring")}${hash || "#reports-panel"}`);
        return;
      }
      if (wantExpense && !wantSettlement && !wantInvoice && !wantReports && section !== "expenses") {
        router.replace(`${wPath(activeSlug, "expenses")}${hash || "#expense-panel"}`);
        return;
      }
    }

    const id = wantSettlement
      ? "settlement-panel"
      : wantInvoice
        ? "period-invoice-panel"
        : wantReports
          ? "reports-panel"
          : wantExpense
            ? "expense-panel"
            : null;
    if (!id) return;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusPanel, initialLoading, router, section, selectedId, workspaces]);

  const {
    onCreateExpense,
    onSaveOfflineDraft,
    onSyncOfflineDraft,
    onCreateSettlement,
    onCreatePaymentLink,
    onBalanceSettleLink,
    onConfirmSettlement,
    onDisputeSettlement,
    onCancelSettlement,
    onSubmitExpense,
    onPostExpense,
    onPromoteCompany,
    onReverseExpense,
    onCancelRevise,
    onCreatePeriod,
    onGenerateInvoices,
    onApproveInvoice,
    onDisputeInvoice,
    onResolveInvoiceDispute,
    onIssueInvoice,
    onMarkInvoicePaid,
    onClosePeriod,
    onCancelPeriod,
    onSelectPeriodId,
    onRemoveOfflineDraft,
  } = useFinanceActions({
    startTransition,
    selectedId,
    selectedPeriodId,
    loadScope: section,
    applyWorkspaceData,
    showSuccess,
    setError,
    setSelectedPeriodId,
    title,
    setTitle,
    amountToman,
    setAmountToman,
    expenseDate,
    split,
    expensePeriodId,
    costCenterId,
    missionKind,
    requireCostCenter,
    settleToUserId,
    settleAmountToman,
    periodTitle,
    periodKind,
    periodStartsOn,
    periodEndsOn,
    setOfflineDrafts,
    setLastDraftSavedAt,
    setSettlementNps,
    revisingExpenseId,
    setRevisingExpenseId,
    reviseReason,
    setReviseReason,
    fundingSourceKind,
    fundingRefId,
    balances,
    paymentsLive,
  });

  function onBeginReviseExpense(expenseId: string, reason: string) {
    const expense = expenses.find((row) => row.id === expenseId);
    if (!expense || expense.status === "reversed") {
      setError("خرج قابل اصلاح نیست");
      return;
    }
    const nextSplit = splitComposerFromExpense(expense, irrMinorToTomanInput);
    setSplit(nextSplit);
    setTitle(expense.title);
    setAmountToman(irrMinorToTomanInput(expense.total.amountMinor));
    setExpenseDate(expense.occurredOn);
    setExpensePeriodId(expense.periodId ?? "");
    setCostCenterId(expense.costCenterId ?? "");
    if (expense.fundingSourceKind === "petty_cash" && expense.fundingRefId) {
      setFundingSourceKind("petty_cash");
      setFundingRefId(expense.fundingRefId);
    } else if (expense.fundingSourceKind === "personal") {
      setFundingSourceKind("personal");
      setFundingRefId("");
    } else {
      setFundingSourceKind("");
      setFundingRefId("");
    }
    setReviseReason(reason);
    setRevisingExpenseId(expenseId);
    setError(null);
    showSuccess("فرم برای اصلاح پر شد — مبلغ/سهم را درست کنید و ثبت کنید");
    window.setTimeout(() => {
      document.getElementById("expense-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  function memberLabel(userId: string) {
    return members.find((member) => member.userId === userId)?.displayName ?? userId.slice(0, 8);
  }

  const myNetMinor = session?.actor
    ? (balances?.lines.find((line) => line.userId === session.actor?.userId)?.net.amountMinor ?? "0")
    : "0";
  const myNetToman = Math.round(Number(myNetMinor) / 10);
  const supportsCompany = templateSupportsCompanyExpenses(
    workspaces.find((w) => w.id === selectedId)?.template,
  );
  const myMembershipRole = members.find((m) => m.userId === session?.actor?.userId)?.role;
  const canManageFinance = isFinanceManagerRole(myMembershipRole);
  const readOnlyFinance = isReadOnlyRole(myMembershipRole);
  const canApproveCompany =
    !!myMembershipRole &&
    ["owner", "admin", "approver", "finance"].includes(myMembershipRole);
  const filteredExpenses =
    expenseFilter === "all"
      ? expenses
      : expenses.filter((expense) => expense.visibility === expenseFilter);
  const selectedWorkspace = workspaces.find((w) => w.id === selectedId);
  const slug = selectedWorkspace?.slug ?? null;
  const spaceKind = spaceKindForTemplate(selectedWorkspace?.template);
  const membersHref = slug ? wPath(slug, "members") : hubPathFor("/workspaces/invite");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const openSettlementCount = settlements.filter(
    (s) => s.status === "claimed" || s.status === "disputed",
  ).length;
  const showOpsRail = Boolean(slug) && spaceKind !== "personal";

  const sectionMeta =
    section === "settlements"
      ? {
          title: NAV_LABELS.settlements,
          description: "ثبت و تأیید تسویه از ماندهٔ واقعی اعضا.",
          primary: (
            <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
          ),
          secondary: slug ? (
            <>
              <Link href={`${membersHref}#member-add-panel`}>{NAV_LABELS.members}</Link>
              <Link href={wPath(slug, "space")}>{NAV_LABELS.spaceGroup}</Link>
            </>
          ) : undefined,
        }
      : section === "invoices"
        ? {
            title: NAV_LABELS.invoices,
            description: "دوره‌ها و صورتحساب دوره‌ای اعضا از دادهٔ ثبت‌شدهٔ همین فضا (جدا از صورتحساب سهم‌محور).",
            primary: canManageFinance ? (
              <a href="#period-invoice-panel">ساخت دوره</a>
            ) : (
              <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
            ),
            secondary: slug ? (
              <>
                <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
                <Link href={`${membersHref}#member-add-panel`}>{NAV_LABELS.members}</Link>
              </>
            ) : undefined,
          }
        : section === "recurring"
          ? {
              title: NAV_LABELS.recurring,
              description: "گزارش‌های دوره‌ای، دسته‌ها و قواعد تکرارشونده از API.",
              primary: (
                <a href="#reports-panel">محاسبه گزارش</a>
              ),
              secondary: slug ? (
                <>
                  <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
                  <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
                </>
              ) : undefined,
            }
          : {
              title: NAV_LABELS.expenses,
              description:
                spaceKind === "building"
                  ? "شارژ و قبوض واحدها از دادهٔ واقعی — از واحد می‌توانید با عنوان پیش‌پر ثبت کنید."
                  : spaceKind === "org"
                    ? "خرج شرکتی و بخش‌ها از دادهٔ واقعی فضای سازمان."
                    : "فهرست خرج و ثبت سریع از دادهٔ واقعی فضای فعال.",
              primary: readOnlyFinance ? (
                <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
              ) : (
                <a href="#expense-panel">{NAV_LABELS.addExpense}</a>
              ),
              secondary: slug ? (
                <>
                  <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
                  <Link href={`${membersHref}#member-add-panel`}>{NAV_LABELS.members}</Link>
                </>
              ) : undefined,
            };

  const frameState =
    initialLoading
      ? "loading"
      : error && !selectedId
        ? "error"
        : workspaces.length === 0
          ? "empty"
          : "ready";

  return (
    <AppShell
      workspaceId={chrome.workspaceId || selectedId}
      workspaceName={workspaces.find((w) => w.id === selectedId)?.name}
      userName={session?.actor?.displayName ?? devDisplayName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={sectionMeta.title}
        description={sectionMeta.description}
        primaryAction={sectionMeta.primary}
        secondaryActions={sectionMeta.secondary}
        state={frameState}
        loadingLabel="در حال بارگذاری مالی…"
        skeletonRows={4}
        error={
          <StatusLine>
            {error ?? "بارگذاری مالی ناموفق بود."}{" "}
            <Button type="button" variant="secondary" onClick={refresh} disabled={pending}>
              تلاش دوباره
            </Button>
          </StatusLine>
        }
        empty={
          <EmptyHint>
            هنوز فضایی ندارید. از <Link href="/spaces/new">ساخت فضای کاری</Link> شروع کنید.
          </EmptyHint>
        }
      >
      <FlashMessages error={error} successMessage={successMessage} />
      {showOpsRail && slug ? (
        <GroupOpsRail
          slug={slug}
          spaceKind={spaceKind}
          memberCount={members.filter((m) => !m.disabledAt).length}
          openSettlements={openSettlementCount}
          canManageMembers={canManageFinance}
          showSubunits={spaceKind === "building" || spaceKind === "org"}
          subunitsHint={
            spaceKind === "building"
              ? "واحدها و ساکنان"
              : spaceKind === "org"
                ? "بخش‌ها و زیرمجموعه‌ها"
                : undefined
          }
        />
      ) : null}
      {error && !initialLoading && selectedId ? (
        <StatusLine>
          {error}{" "}
          <Button type="button" variant="secondary" onClick={refresh} disabled={pending}>
            تلاش دوباره
          </Button>
        </StatusLine>
      ) : null}

      {selectedId && section === "expenses" ? (
        <>
          <div className="heroGrid">
            <HeroBalance
              label="مانده خالص شما"
              amount={formatToman(myNetToman)}
              subtitle={myNetToman >= 0 ? "تومان طلب دارید" : "تومان بدهکارید"}
              actionLabel={NAV_LABELS.settlements}
              onAction={() => router.push(settlementsHref)}
              hint={balances ? zeroSumHint(balances.zeroSum) : "…"}
            />
          </div>

          <ProductGrid cols={2}>
            <FinanceSummaryCard
              balances={balances}
              memberLabel={memberLabel}
              slug={slug}
              currentUserId={session?.actor?.userId}
              canManage={canManageFinance}
              paymentsLive={paymentsLive}
              onCreateSettleLink={onBalanceSettleLink}
              pending={pending}
              readOnly={readOnlyFinance}
            />
            <ExpenseListPanel
              filteredExpenses={filteredExpenses}
              expenseFilter={expenseFilter}
              onFilterChange={setExpenseFilter}
              expenseFrom={expenseFrom}
              expenseTo={expenseTo}
              onExpenseFromChange={setExpenseFrom}
              onExpenseToChange={setExpenseTo}
              catalogItemId={expenseCatalogItemId}
              catalogOptions={catalogFilterOptions}
              onCatalogItemIdChange={
                chrome.capabilities?.providers?.catalog === "catalog_v1"
                  ? setExpenseCatalogItemId
                  : undefined
              }
              searchQuery={expenseSearchQ}
              onSearchQueryChange={setExpenseSearchQ}
              paidByUserId={expensePaidByUserId}
              onPaidByUserIdChange={setExpensePaidByUserId}
              payerOptions={members.map((m) => ({
                id: m.userId,
                name: m.displayName,
              }))}
              categoryId={expenseCategoryId}
              onCategoryIdChange={setExpenseCategoryId}
              categoryOptions={categoryFilterOptions}
              tagId={expenseTagId}
              onTagIdChange={setExpenseTagId}
              tagOptions={tagFilterOptions}
              ocrMode={
                capabilities?.providers?.ocr === "configured" ? "configured" : "stub"
              }
              onApplyOcr={(hints) => {
                if (hints.title) setTitle(hints.title);
                if (hints.amountToman) setAmountToman(hints.amountToman);
                showSuccess("پیشنهاد OCR روی فرم اعمال شد");
              }}
              supportsCompany={supportsCompany}
              canApproveCompany={canApproveCompany}
              selectedId={selectedId}
              pending={pending}
              canManageFinance={canManageFinance}
              readOnly={readOnlyFinance}
              memberLabel={memberLabel}
              initialExpenseId={initialExpenseId}
              onSubmitExpense={onSubmitExpense}
              onPostExpense={onPostExpense}
              onPromoteCompany={onPromoteCompany}
              onReverseExpense={onReverseExpense}
              onBeginReviseExpense={onBeginReviseExpense}
            />
          </ProductGrid>

          {readOnlyFinance ? (
            <SectionCard title={NAV_LABELS.addExpense} tone="quiet">
              <StatusLine>
                نقش {membershipRoleLabel(myMembershipRole)} فقط مشاهده دارد — ثبت خرج برای
                شما فعال نیست.
              </StatusLine>
            </SectionCard>
          ) : (
            <ProductGrid>
              <ExpenseFormPanel
                title={title}
                onTitleChange={setTitle}
                amountToman={amountToman}
                onAmountTomanChange={setAmountToman}
                expenseDate={expenseDate}
                onExpenseDateChange={setExpenseDate}
                split={split}
                onSplitChange={setSplit}
                expensePeriodId={expensePeriodId}
                onExpensePeriodIdChange={setExpensePeriodId}
                periods={periods}
                members={members}
                supportsCompany={supportsCompany}
                session={session}
                offlineDrafts={offlineDrafts}
                lastDraftSavedAt={lastDraftSavedAt}
                pending={pending}
                canAssignPrivateToOthers={canManageFinance}
                costCenters={costCenters}
                costCenterId={costCenterId}
                onCostCenterIdChange={setCostCenterId}
                requireCostCenter={requireCostCenter}
                missionKind={missionKind}
                onMissionKindChange={setMissionKind}
                workspaceId={selectedId}
                catalogEnabled={chrome.capabilities?.providers?.catalog === "catalog_v1"}
                allowFormula={spaceKind === "building"}
                splitPresets={splitPresets}
                onSaveSplitPreset={(name) => {
                  if (!selectedId) return;
                  startTransition(() => {
                    void (async () => {
                      try {
                        const lines = split.participantUserIds.map((userId) => {
                          if (split.splitMethod === "shares") {
                            return {
                              userId,
                              shares: Number(split.lineInputs[userId] || "1") || 1,
                            };
                          }
                          if (split.splitMethod === "percent") {
                            const pct = Number(split.lineInputs[userId] || "0");
                            return {
                              userId,
                              percentBp: Math.round(pct * 100),
                            };
                          }
                          if (split.splitMethod === "amount") {
                            const toman = Number(split.lineInputs[userId] || "0");
                            return {
                              userId,
                              amountMinor: String(Math.round(toman * 10)),
                            };
                          }
                          return { userId, shares: 1 };
                        });
                        await api.createSplitPreset(selectedId, {
                          name,
                          splitMethod:
                            split.splitMethod === "itemized" ||
                            split.splitMethod === "formula"
                              ? "equal"
                              : split.splitMethod,
                          lines,
                          idempotencyKey: newClientId(),
                        });
                        const presets = await api.listSplitPresets(selectedId);
                        setSplitPresets(
                          presets.map((p) => ({
                            id: p.id,
                            name: p.name,
                            splitMethod: p.splitMethod,
                            lines: p.lines,
                          })),
                        );
                        showSuccess("قالب سهم ذخیره شد");
                      } catch (err: unknown) {
                        setError(friendlyErrorMessage(err, "ذخیره قالب سهم ناموفق"));
                      }
                    })();
                  });
                }}
                savePresetPending={pending}
                revisingExpenseId={revisingExpenseId}
                onCancelRevise={onCancelRevise}
                pettyCashFunds={pettyCashFunds}
                fundingSourceKind={fundingSourceKind}
                fundingRefId={fundingRefId}
                onFundingSourceKindChange={setFundingSourceKind}
                onFundingRefIdChange={setFundingRefId}
                onCreateExpense={onCreateExpense}
                onSaveOfflineDraft={onSaveOfflineDraft}
                onSyncOfflineDraft={onSyncOfflineDraft}
                onRemoveOfflineDraft={onRemoveOfflineDraft}
              />
            </ProductGrid>
          )}
        </>
      ) : null}

      {selectedId && section === "settlements" ? (
        <>
          <div className="heroGrid">
            <HeroBalance
              label="مانده خالص شما"
              amount={formatToman(myNetToman)}
              subtitle={myNetToman >= 0 ? "تومان طلب دارید" : "تومان بدهکارید"}
              actionLabel={NAV_LABELS.expenses}
              onAction={() => router.push(expensesHref)}
              hint={balances ? zeroSumHint(balances.zeroSum) : "…"}
            />
          </div>
          <ProductGrid>
            <SettlementPanel
              workspaceId={selectedId}
              members={members}
              settleToUserId={settleToUserId}
              onSettleToUserIdChange={setSettleToUserId}
              settleAmountToman={settleAmountToman}
              onSettleAmountTomanChange={setSettleAmountToman}
              settlements={settlements}
              paymentLinks={paymentLinks}
              paymentsLive={paymentsLive}
              balances={balances}
              currentUserId={session?.actor?.userId}
              myRole={myMembershipRole}
              readOnly={readOnlyFinance}
              pending={pending}
              settlementNps={settlementNps}
              onDismissNps={() => setSettlementNps(false)}
              memberLabel={memberLabel}
              membersHref={membersHref}
              slug={slug}
              onCreateSettlement={onCreateSettlement}
              onConfirmSettlement={onConfirmSettlement}
              onDisputeSettlement={onDisputeSettlement}
              evidenceRequired={Boolean(
                capabilities?.productFlags?.settlementEvidence,
              )}
              onCancelSettlement={onCancelSettlement}
              onCreatePaymentLink={onCreatePaymentLink}
            />
            {capabilities?.productFlags?.debtSimplifyApi ? (
              <DebtSimplifyPanel
                workspaceId={selectedId}
                memberLabel={memberLabel}
                enabled
                currentUserId={session?.actor?.userId}
                readOnly={readOnlyFinance}
                canApplyClaims={canManageFinance}
                onError={setError}
                onSuccess={showSuccess}
                onApplied={() => {
                  void loadWorkspaceData(
                    selectedId,
                    selectedPeriodId,
                    undefined,
                    section,
                  ).then(applyWorkspaceData);
                }}
              />
            ) : null}
          </ProductGrid>
        </>
      ) : null}

      {selectedId && section === "invoices" ? (
        <ProductGrid cols={2}>
          {periodsError ? (
            <StatusLine>
              دوره‌های مالی بارگذاری نشد: {periodsError} — بقیهٔ صفحه از دادهٔ واقعی است؛ بعد از
              رفع اسکیما/سرور دوباره تلاش کنید.{" "}
              <Button type="button" variant="secondary" onClick={refresh} disabled={pending}>
                تلاش دوباره
              </Button>
            </StatusLine>
          ) : null}
          <PeriodInvoicePanels
            periods={periods}
            periodTitle={periodTitle}
            onPeriodTitleChange={setPeriodTitle}
            periodKind={periodKind}
            onPeriodKindChange={setPeriodKind}
            periodStartsOn={periodStartsOn}
            onPeriodStartsOnChange={setPeriodStartsOn}
            periodEndsOn={periodEndsOn}
            onPeriodEndsOnChange={setPeriodEndsOn}
            selectedPeriodId={selectedPeriodId}
            onSelectPeriodId={onSelectPeriodId}
            invoices={invoices}
            invoiceAdjustments={invoiceAdjustments}
            paymentLinks={paymentLinks}
            paymentsLive={paymentsLive}
            pending={pending}
            session={session}
            memberLabel={memberLabel}
            slug={slug}
            canManageInvoices={canManageFinance}
            automation={
              chrome.capabilities?.providers?.billingAutomation
                ? {
                    mode: chrome.capabilities.providers.billingAutomation,
                    reconcile: chrome.capabilities.providers.invoiceReconcile,
                  }
                : null
            }
            onCreatePeriod={onCreatePeriod}
            onGenerateInvoices={onGenerateInvoices}
            onClosePeriod={onClosePeriod}
            onCancelPeriod={onCancelPeriod}
            onApproveInvoice={onApproveInvoice}
            onDisputeInvoice={onDisputeInvoice}
            onResolveInvoiceDispute={onResolveInvoiceDispute}
            onIssueInvoice={onIssueInvoice}
            onMarkInvoicePaid={onMarkInvoicePaid}
          />
        </ProductGrid>
      ) : null}

      {selectedId && section === "recurring" ? (
        <ProductGrid>
          <div id="reports-panel">
            <WorkspaceReportsPanel
              workspaceId={selectedId}
              defaultVisibility={supportsCompany ? "company" : "shared"}
              readOnly={readOnlyFinance}
              onChanged={() => {
                void loadWorkspaceData(selectedId, selectedPeriodId, undefined, section).then(applyWorkspaceData);
              }}
            />          </div>
          <ProductGrid cols={2}>
            <LedgerAuditPanels
              ledgerEntries={ledgerEntries}
              auditEvents={auditEvents}
              memberLabel={memberLabel}
            />
          </ProductGrid>
        </ProductGrid>
      ) : null}

      <details className="devtoolsDetails">
        <summary>تنظیمات توسعه‌دهنده</summary>
        <FormStack>
          <p className="emptyHint" style={{ border: "none", padding: 0 }}>
            تا OIDC، هویت از localStorage می‌آید.
            {session?.actor ? (
              <>
                {" "}
                الان: {session.actor.displayName} ({session.mode})
              </>
            ) : null}
          </p>
          <TextField
            label="Subject"
            value={devSubject}
            onChange={(event) => setDevSubject(event.target.value)}
          />
          <TextField
            label="نام نمایشی"
            value={devDisplayName}
            onChange={(event) => setDevDisplayName(event.target.value)}
          />
          <Button type="button" onClick={refresh} disabled={pending}>
            اعمال هویت و تازه‌سازی
          </Button>
        </FormStack>
      </details>
      </WorkspacePageFrame>
    </AppShell>
  );
}
