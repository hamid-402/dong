"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type {
  CostCenterSummary,
  ExpensePeriodSummary,
  ExpenseSummary,
  JournalEntrySummary,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  MembershipSummary,
  PaymentLinkSummary,
  PeriodKind,
  PettyCashFundSummary,
  SettlementSummary,
  SplitMethod,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import {
  isExpenseApproverRole,
  isFinanceManagerRole,
  isReadOnlyRole,
  spaceKindForTemplate,
} from "@dang/contracts";
import { Button } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  emptySplitComposer,
  splitComposerFromExpense,
  type SplitComposerValue,
} from "@/components/split-composer";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { GroupOpsRail } from "@/components/shell/group-ops-rail";
import { TreasuryBalanceCard } from "@/components/shell/treasury-balance-card";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import {
  api,
  DEV_IDENTITY_DEFAULTS,
  getDevIdentity,
  setDevIdentity,
  type AuditEventDto,
} from "@/lib/api";
import { hubPathFor } from "@/lib/hub-links";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  readUnitPrefillFromUrl,
  titleForUnitPrefill,
} from "@/lib/expense-unit-href";
import {
  displayInputToIrrMinor,
  irrMinorToDisplayInput,
} from "@/lib/irr-money";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyUnitSuffix } from "@/lib/money-labels";
import { wPath } from "@/lib/workspace-paths";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { FlashMessages } from "@/lib/use-flash-message";
import { ProviderStubBadges } from "@/components/shell/provider-stub-badges";
import { MotionSceneStrip } from "@/components/visual/motion-scene";
import {
  listOfflineExpenseDrafts,
  type OfflineExpenseDraft,
} from "@/lib/offline-drafts";
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
import {
  readExpenseIdFromUrl,
  readOutingIdFromUrl,
  readPaymentResultFromUrl,
  readSettleAmountFromUrl,
  readSettleToFromUrl,
  stripPaymentResultFromUrl,
} from "@/components/views/finance/finance-url";
import { FxRatesPanel } from "@/components/fx-rates-panel";
import { WaveFFinancePanel } from "@/components/wave-f-finance-panel";
import { buildFinanceSectionChrome } from "@/components/views/finance/finance-section-chrome";
import { FinanceExpensesSection } from "@/components/views/finance/finance-expenses-section";
import { FinanceSettlementsSection } from "@/components/views/finance/finance-settlements-section";
import { FinanceInvoicesSection } from "@/components/views/finance/finance-invoices-section";
import { FinanceRecurringSection } from "@/components/views/finance/finance-recurring-section";
import { FinanceDevTools } from "@/components/views/finance/finance-devtools";
import { FundSettlementRebuildPanel } from "@/components/views/finance/fund-settlement-rebuild-panel";
import { saveSplitPresetAndReload } from "@/components/views/finance/finance-split-preset";
import { loadFinanceSideData } from "@/components/views/finance/finance-side-data";
import { usePathname, useRouter } from "next/navigation";

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
  const displayUnit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(displayUnit);
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
    "" | "personal" | "petty_cash" | "member" | "credit"
  >("");
  const [fundingRefId, setFundingRefId] = useState("");
  const [pettyCashFunds, setPettyCashFunds] = useState<PettyCashFundSummary[]>([]);
  const [savingsBalanceMinor, setSavingsBalanceMinor] = useState<string | null>(
    null,
  );
  const [savingsGoalCount, setSavingsGoalCount] = useState(0);
  const [settleToUserId, setSettleToUserId] = useState(() => readSettleToFromUrl());
  const [settleAmountToman, setSettleAmountToman] = useState(() => readSettleAmountFromUrl());
  const [initialExpenseId] = useState(() => readExpenseIdFromUrl());
  const [outingId, setOutingId] = useState(() => readOutingIdFromUrl());
  const [originalCurrency, setOriginalCurrency] = useState("");
  const [originalAmountMajor, setOriginalAmountMajor] = useState("");
  const settlePrefillDone = useRef(Boolean(readSettleAmountFromUrl()));
  const paymentReturnHandled = useRef(false);
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

  // Zarinpal / PSP return: ?payment=ok|failed (R3) — show once then strip query.
  useEffect(() => {
    if (paymentReturnHandled.current) return;
    const result = readPaymentResultFromUrl();
    if (!result) return;
    paymentReturnHandled.current = true;
    if (result.payment === "ok") {
      showSuccess(
        result.refId
          ? `پرداخت موفق · رسید ${result.refId}`
          : "پرداخت موفق ثبت شد",
      );
      refresh();
    } else {
      setError(
        result.status
          ? `پرداخت ناموفق (${result.status})`
          : "پرداخت ناموفق بود",
      );
    }
    router.replace(stripPaymentResultFromUrl(), { scroll: false });
    // one-shot payment-result consume on mount
  }, []);

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
        const side = await loadFinanceSideData(selectedId, chrome.capabilities);
        if (!cancelled) {
          setCostCenters(side.costCenters);
          setCostCenterId("");
          setRequireCostCenter(side.requireCostCenter);
          setMissionKind("");
          setPettyCashFunds(side.pettyCashFunds);
          if (side.pettyCashFunds.length === 0) {
            setFundingSourceKind("");
            setFundingRefId("");
          }
          setCatalogFilterOptions(side.catalogOptions);
          if (side.catalogOptions.length === 0) setExpenseCatalogItemId("");
          setCategoryFilterOptions(side.categoryOptions);
          setTagFilterOptions(side.tagOptions);
          setSplitPresets(side.splitPresets);
          const ws = workspaces.find((w) => w.id === selectedId);
          const kind = spaceKindForTemplate(ws?.template);
          if (
            kind === "personal" &&
            chrome.capabilities?.providers?.savingsGoals === "goals_v1"
          ) {
            const fund = await api.getSavingsFund().catch(() => null);
            if (!cancelled) {
              setSavingsBalanceMinor(fund?.balanceMinor ?? "0");
              setSavingsGoalCount(fund?.goalCount ?? 0);
            }
          } else if (!cancelled) {
            setSavingsBalanceMinor(null);
            setSavingsGoalCount(0);
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
    const absMinor = (
      BigInt(line.net.amountMinor) < 0n
        ? -BigInt(line.net.amountMinor)
        : BigInt(line.net.amountMinor)
    ).toString();
    const display = irrMinorToDisplayInput(absMinor, displayUnit);
    if (!display) return;
    setSettleAmountToman(display);
    settlePrefillDone.current = true;
  }, [balances, settleToUserId, settleAmountToman, displayUnit]);

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
    onSettlePay,
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
    outingId,
    setOutingId,
    balances,
    paymentsLive,
    conversionLive: Boolean(capabilities?.conversionLive),
    originalCurrency,
    setOriginalCurrency,
    originalAmountMajor,
    setOriginalAmountMajor,
  });

  function onBeginReviseExpense(expenseId: string, reason: string) {
    const expense = expenses.find((row) => row.id === expenseId);
    if (!expense || expense.status === "reversed") {
      setError("خرج قابل اصلاح نیست");
      return;
    }
    const toDisplay = (minor: string) =>
      irrMinorToDisplayInput(minor, displayUnit);
    const nextSplit = splitComposerFromExpense(expense, toDisplay);
    setSplit(nextSplit);
    setTitle(expense.title);
    setAmountToman(toDisplay(expense.total.amountMinor));
    setExpenseDate(expense.occurredOn);
    setExpensePeriodId(expense.periodId ?? "");
    setCostCenterId(expense.costCenterId ?? "");
    if (expense.fundingSourceKind === "petty_cash" && expense.fundingRefId) {
      setFundingSourceKind("petty_cash");
      setFundingRefId(expense.fundingRefId);
    } else if (expense.fundingSourceKind === "member" && expense.fundingRefId) {
      setFundingSourceKind("member");
      setFundingRefId(expense.fundingRefId);
    } else if (expense.fundingSourceKind === "credit") {
      setFundingSourceKind("credit");
      setFundingRefId("");
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
  const supportsCompany = templateSupportsCompanyExpenses(
    workspaces.find((w) => w.id === selectedId)?.template,
  );
  const myMembershipRole = members.find((m) => m.userId === session?.actor?.userId)?.role;
  const canManageFinance = isFinanceManagerRole(myMembershipRole);
  const readOnlyFinance = isReadOnlyRole(myMembershipRole);
  const canApproveCompany = isExpenseApproverRole(myMembershipRole);
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
  // R4: bottom tabs + section chrome already cover ops destinations — avoid duplicate rail.
  const showOpsRail = false;

  const sectionMeta = buildFinanceSectionChrome({
    section,
    spaceKind,
    slug,
    expensesHref,
    settlementsHref,
    membersHref,
    canManageFinance,
    readOnlyFinance,
    membershipRole: myMembershipRole,
    canApproveCompany,
  });

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
      <ProviderStubBadges capabilities={capabilities} />
      <MotionSceneStrip
        kind="finance"
        prominence={section === "expenses" ? "compact" : "banner"}
      />
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

      {(() => {
        const showTreasury =
          Boolean(selectedId && slug) &&
          (spaceKind === "personal" ||
            capabilities?.providers?.pettyCash === "fund_v1");
        if (!showTreasury || !slug) return null;
        const treasury = (
          <TreasuryBalanceCard
            spaceKind={spaceKind}
            funds={pettyCashFunds}
            paymentsHref={wPath(slug, "payments")}
            savingsHref="/me/finance#goals"
            canManage={canManageFinance || spaceKind === "personal"}
            pending={pending}
            memberLabel={memberLabel}
            savingsBalanceMinor={
              spaceKind === "personal" ? savingsBalanceMinor : null
            }
            savingsGoalCount={savingsGoalCount}
            onEnsureSavings={
              spaceKind === "personal" &&
              capabilities?.providers?.savingsGoals === "goals_v1"
                ? () => {
                    startTransition(() => {
                      void (async () => {
                        try {
                          const result = await api.ensureDefaultSavingsFund({
                            idempotencyKey: crypto.randomUUID(),
                          });
                          setSavingsBalanceMinor(result.fund.balanceMinor);
                          setSavingsGoalCount(result.fund.goalCount);
                          showSuccess(
                            result.created
                              ? "صندوق پس‌انداز ایجاد شد"
                              : "صندوق پس‌انداز از قبل وجود داشت",
                          );
                        } catch (err) {
                          setError(
                            friendlyErrorMessage(
                              err,
                              "ایجاد صندوق پس‌انداز ناموفق",
                            ),
                          );
                        }
                      })();
                    });
                  }
                : undefined
            }
            onDepositSavings={
              spaceKind === "personal" &&
              capabilities?.providers?.savingsGoals === "goals_v1"
                ? () => {
                    const raw = window.prompt(
                      `مبلغ واریز ماهانه (${unitLabel})`,
                    );
                    if (raw == null) return;
                    const money = displayInputToIrrMinor(raw, displayUnit);
                    if (!money) {
                      setError("مبلغ معتبر نیست");
                      return;
                    }
                    startTransition(() => {
                      void (async () => {
                        try {
                          const result = await api.depositSavingsFund({
                            amountMinor: money.amountMinor,
                            note: "واریز ماهانه",
                            idempotencyKey: crypto.randomUUID(),
                          });
                          setSavingsBalanceMinor(result.fund.balanceMinor);
                          setSavingsGoalCount(result.fund.goalCount);
                          showSuccess("واریز در صندوق پس‌انداز ثبت شد");
                        } catch (err) {
                          setError(
                            friendlyErrorMessage(err, "واریز پس‌انداز ناموفق"),
                          );
                        }
                      })();
                    });
                  }
                : undefined
            }
            onEnsureDefault={
              canManageFinance && spaceKind !== "personal"
                ? () => {
                    startTransition(() => {
                      void (async () => {
                        try {
                          const result = await api.ensureDefaultPettyCashFund(
                            selectedId,
                            { idempotencyKey: crypto.randomUUID() },
                          );
                          setPettyCashFunds(
                            result.funds.filter((f) => f.active),
                          );
                          showSuccess(
                            result.created
                              ? "تنخواه اصلی ایجاد شد"
                              : "تنخواه اصلی از قبل وجود داشت",
                          );
                        } catch (err) {
                          setError(
                            friendlyErrorMessage(err, "ایجاد تنخواه ناموفق"),
                          );
                        }
                      })();
                    });
                  }
                : undefined
            }
          />
        );
        // On expenses: fold into layer 3 via contextPanels below. Elsewhere keep visible.
        if (section === "expenses") return null;
        return <div style={{ marginBottom: "1rem" }}>{treasury}</div>;
      })()}

      {selectedId && section === "expenses" ? (
        <FinanceExpensesSection
          myNetMinor={myNetMinor}
          balances={balances}
          onGoSettlements={() => router.push(settlementsHref)}
          memberLabel={memberLabel}
          slug={slug}
          currentUserId={session?.actor?.userId}
          canManageFinance={canManageFinance}
          paymentsLive={paymentsLive}
          onCreateSettleLink={onBalanceSettleLink}
          pending={pending}
          readOnlyFinance={readOnlyFinance}
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
          initialExpenseId={initialExpenseId}
          onSubmitExpense={onSubmitExpense}
          onPostExpense={onPostExpense}
          onPromoteCompany={onPromoteCompany}
          onReverseExpense={onReverseExpense}
          onBeginReviseExpense={onBeginReviseExpense}
          myMembershipRole={myMembershipRole}
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
          session={session}
          offlineDrafts={offlineDrafts}
          lastDraftSavedAt={lastDraftSavedAt}
          costCenters={costCenters}
          costCenterId={costCenterId}
          onCostCenterIdChange={setCostCenterId}
          requireCostCenter={requireCostCenter}
          missionKind={missionKind}
          onMissionKindChange={setMissionKind}
          catalogEnabled={chrome.capabilities?.providers?.catalog === "catalog_v1"}
          allowFormula={spaceKind === "building"}
          spaceKind={spaceKind}
          splitPresets={splitPresets}
          onSaveSplitPreset={(name) => {
            if (!selectedId) return;
            startTransition(() => {
              void (async () => {
                try {
                  const next = await saveSplitPresetAndReload(selectedId, name, split);
                  setSplitPresets(next);
                  showSuccess("قالب سهم ذخیره شد");
                } catch (err: unknown) {
                  setError(friendlyErrorMessage(err, "ذخیره قالب سهم ناموفق"));
                }
              })();
            });
          }}
          revisingExpenseId={revisingExpenseId}
          onCancelRevise={onCancelRevise}
          pettyCashFunds={pettyCashFunds}
          fundingSourceKind={fundingSourceKind}
          fundingRefId={fundingRefId}
          onFundingSourceKindChange={setFundingSourceKind}
          onFundingRefIdChange={setFundingRefId}
          conversionLive={Boolean(capabilities?.conversionLive)}
          originalCurrency={originalCurrency}
          onOriginalCurrencyChange={setOriginalCurrency}
          originalAmountMajor={originalAmountMajor}
          onOriginalAmountMajorChange={setOriginalAmountMajor}
          onCreateExpense={onCreateExpense}
          onSaveOfflineDraft={onSaveOfflineDraft}
          onSyncOfflineDraft={onSyncOfflineDraft}
          onRemoveOfflineDraft={onRemoveOfflineDraft}
          fundAsSettlementParty={Boolean(
            capabilities?.productFlags?.fundAsSettlementParty,
          )}
          contextPanels={
            selectedId &&
            slug &&
            (spaceKind === "personal" ||
              capabilities?.providers?.pettyCash === "fund_v1") ? (
              <details className="scrollDisclosure financeContextFold">
                <summary className="panelHeader">
                  تنخواه و صندوق
                  <span className="financeContextFold__hint">
                    جزئیات و شارژ در پرداخت‌ها
                  </span>
                </summary>
                <div className="scrollDisclosure__body">
                  <TreasuryBalanceCard
                    spaceKind={spaceKind}
                    funds={pettyCashFunds}
                    paymentsHref={wPath(slug, "payments")}
                    savingsHref="/me/finance#goals"
                    canManage={canManageFinance || spaceKind === "personal"}
                    pending={pending}
                    memberLabel={memberLabel}
                    savingsBalanceMinor={
                      spaceKind === "personal" ? savingsBalanceMinor : null
                    }
                    savingsGoalCount={savingsGoalCount}
                    onEnsureSavings={
                      spaceKind === "personal" &&
                      capabilities?.providers?.savingsGoals === "goals_v1"
                        ? () => {
                            startTransition(() => {
                              void (async () => {
                                try {
                                  const result = await api.ensureDefaultSavingsFund({
                                    idempotencyKey: crypto.randomUUID(),
                                  });
                                  setSavingsBalanceMinor(result.fund.balanceMinor);
                                  setSavingsGoalCount(result.fund.goalCount);
                                  showSuccess(
                                    result.created
                                      ? "صندوق پس‌انداز ایجاد شد"
                                      : "صندوق پس‌انداز از قبل وجود داشت",
                                  );
                                } catch (err) {
                                  setError(
                                    friendlyErrorMessage(
                                      err,
                                      "ایجاد صندوق پس‌انداز ناموفق",
                                    ),
                                  );
                                }
                              })();
                            });
                          }
                        : undefined
                    }
                    onDepositSavings={
                      spaceKind === "personal" &&
                      capabilities?.providers?.savingsGoals === "goals_v1"
                        ? () => {
                            const raw = window.prompt(
                              `مبلغ واریز ماهانه (${unitLabel})`,
                            );
                            if (raw == null) return;
                            const money = displayInputToIrrMinor(raw, displayUnit);
                            if (!money) {
                              setError("مبلغ معتبر نیست");
                              return;
                            }
                            startTransition(() => {
                              void (async () => {
                                try {
                                  const result = await api.depositSavingsFund({
                                    amountMinor: money.amountMinor,
                                    note: "واریز ماهانه",
                                    idempotencyKey: crypto.randomUUID(),
                                  });
                                  setSavingsBalanceMinor(result.fund.balanceMinor);
                                  setSavingsGoalCount(result.fund.goalCount);
                                  showSuccess("واریز در صندوق پس‌انداز ثبت شد");
                                } catch (err) {
                                  setError(
                                    friendlyErrorMessage(
                                      err,
                                      "واریز پس‌انداز ناموفق",
                                    ),
                                  );
                                }
                              })();
                            });
                          }
                        : undefined
                    }
                    onEnsureDefault={
                      canManageFinance && spaceKind !== "personal"
                        ? () => {
                            startTransition(() => {
                              void (async () => {
                                try {
                                  const result = await api.ensureDefaultPettyCashFund(
                                    selectedId,
                                    { idempotencyKey: crypto.randomUUID() },
                                  );
                                  setPettyCashFunds(
                                    result.funds.filter((f) => f.active),
                                  );
                                  showSuccess(
                                    result.created
                                      ? "تنخواه اصلی ایجاد شد"
                                      : "تنخواه اصلی از قبل وجود داشت",
                                  );
                                } catch (err) {
                                  setError(
                                    friendlyErrorMessage(
                                      err,
                                      "ایجاد تنخواه ناموفق",
                                    ),
                                  );
                                }
                              })();
                            });
                          }
                        : undefined
                    }
                  />
                </div>
              </details>
            ) : undefined
          }
        />
      ) : null}

      {selectedId && section === "settlements" ? (
        <FinanceSettlementsSection
          myNetMinor={myNetMinor}
          balances={balances}
          onGoExpenses={() => router.push(expensesHref)}
          workspaceId={selectedId}
          members={members}
          settleToUserId={settleToUserId}
          onSettleToUserIdChange={setSettleToUserId}
          settleAmountToman={settleAmountToman}
          onSettleAmountTomanChange={setSettleAmountToman}
          settlements={settlements}
          paymentLinks={paymentLinks}
          paymentsLive={paymentsLive}
          pettyCashFunds={pettyCashFunds}
          spaceKind={spaceKind}
          currentUserId={session?.actor?.userId}
          myRole={myMembershipRole ?? undefined}
          readOnlyFinance={readOnlyFinance}
          pending={pending}
          settlementNps={settlementNps}
          onDismissNps={() => setSettlementNps(false)}
          memberLabel={memberLabel}
          membersHref={membersHref}
          slug={slug}
          onSettlePay={onSettlePay}
          onConfirmSettlement={onConfirmSettlement}
          onDisputeSettlement={onDisputeSettlement}
          evidenceRequired={Boolean(capabilities?.productFlags?.settlementEvidence)}
          onCancelSettlement={onCancelSettlement}
          onCreatePaymentLink={onCreatePaymentLink}
          debtSimplifyEnabled={Boolean(capabilities?.productFlags?.debtSimplifyApi)}
          canManageFinance={canManageFinance}
          onError={setError}
          onSuccess={showSuccess}
          onDebtApplied={() => {
            void loadWorkspaceData(
              selectedId,
              selectedPeriodId,
              undefined,
              section,
            ).then(applyWorkspaceData);
          }}
        />
      ) : null}

      {selectedId && section === "invoices" ? (
        <FinanceInvoicesSection
          periodsError={periodsError}
          pending={pending}
          onRefresh={refresh}
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
          expenseFundingById={Object.fromEntries(
            expenses.map((e) => [e.id, e.fundingSourceKind]),
          )}
        />
      ) : null}

      {selectedId && section === "recurring" ? (
        <FinanceRecurringSection
          workspaceId={selectedId}
          supportsCompany={supportsCompany}
          readOnlyFinance={readOnlyFinance}
          onReportsChanged={() => {
            void loadWorkspaceData(
              selectedId,
              selectedPeriodId,
              undefined,
              section,
            ).then(applyWorkspaceData);
          }}
          ledgerEntries={ledgerEntries}
          auditEvents={auditEvents}
          memberLabel={memberLabel}
        />
      ) : null}

      {process.env.NODE_ENV === "development" ? (
        <FinanceDevTools
          session={session}
          devSubject={devSubject}
          onDevSubjectChange={setDevSubject}
          devDisplayName={devDisplayName}
          onDevDisplayNameChange={setDevDisplayName}
          pending={pending}
          onApply={refresh}
        />
      ) : null}
      {selectedId &&
      (Boolean(capabilities?.productFlags?.fxRates) ||
        capabilities?.providers?.fxPreview === "preview_v1" ||
        Boolean(capabilities?.productFlags?.fundAsSettlementParty) ||
        (capabilities?.productFlags &&
          (capabilities.productFlags.reimbursement ||
            capabilities.productFlags.categoryBudget ||
            capabilities.productFlags.expenseImport ||
            capabilities.productFlags.expensePolicy))) ? (
        <details
          className="scrollDisclosure financeContextFold"
          open={section !== "expenses"}
        >
          <summary className="panelHeader">
            نرخ ارز و ابزارهای مالی پیشرفته
            <span className="financeContextFold__hint">
              {section === "expenses" ? "در صورت نیاز باز کنید" : "فعال"}
            </span>
          </summary>
          <div className="scrollDisclosure__body">
            {capabilities?.productFlags?.fundAsSettlementParty &&
            canManageFinance &&
            !readOnlyFinance ? (
              <FundSettlementRebuildPanel
                workspaceId={selectedId}
                pending={pending}
                onPendingChange={(run) => startTransition(run)}
                onSuccess={showSuccess}
                onError={setError}
                onCompleted={() =>
                  loadWorkspaceData(
                    selectedId,
                    selectedPeriodId,
                    undefined,
                    section,
                  ).then(applyWorkspaceData)
                }
              />
            ) : null}
            {Boolean(capabilities?.productFlags?.fxRates) ||
            capabilities?.providers?.fxPreview === "preview_v1" ? (
              <FxRatesPanel
                canWrite={Boolean(capabilities?.productFlags?.fxRates)}
                conversionLive={Boolean(capabilities?.conversionLive)}
                readOnly={readOnlyFinance}
                onError={setError}
              />
            ) : null}
            {capabilities?.productFlags &&
            (capabilities.productFlags.reimbursement ||
              capabilities.productFlags.categoryBudget ||
              capabilities.productFlags.expenseImport ||
              capabilities.productFlags.expensePolicy) ? (
              <WaveFFinancePanel
                workspaceId={selectedId}
                flags={capabilities.productFlags}
                readOnly={readOnlyFinance}
                onError={setError}
                onChanged={() => {
                  void loadWorkspaceData(
                    selectedId,
                    selectedPeriodId,
                    undefined,
                    section,
                  ).then(applyWorkspaceData);
                }}
              />
            ) : null}
          </div>
        </details>
      ) : null}
      {outingId ? (
        <StatusLine>
          خرج به گردش متصل می‌شود ·{" "}
          <button type="button" className="textButton" onClick={() => setOutingId("")}>
            برداشتن اتصال
          </button>
        </StatusLine>
      ) : null}
      </WorkspacePageFrame>
    </AppShell>
  );
}
