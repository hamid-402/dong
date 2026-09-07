"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  ExpensePeriodSummary,
  ExpenseSummary,
  ExpenseVisibility,
  JournalEntrySummary,
  MemberInvoiceSummary,
  MembershipSummary,
  PaymentLinkSummary,
  PeriodKind,
  SettlementSummary,
  WorkspaceBalancesResponse,
  CostCenterSummary,
} from "@dang/contracts";
import { isFinanceManagerRole, isReadOnlyRole } from "@dang/contracts";
import { Button, TextField, formatToman } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  emptySplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  EmptyHint,
  FormStack,
  HeroBalance,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity, type AuditEventDto } from "@/lib/api";
import { WorkspaceReportsPanel } from "@/components/workspace-reports-panel";
import { hubPathFor } from "@/lib/hub-links";
import { friendlyErrorMessage } from "@/lib/api-errors";
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
import {
  loadWorkspaceData,
  type FinanceWorkspaceData,
} from "@/components/views/finance/use-finance-data";
import { useFinanceActions } from "@/components/views/finance/use-finance-actions";
import { useRouter } from "next/navigation";

export type FinanceSection =
  | "expenses"
  | "settlements"
  | "invoices"
  | "recurring";

const SECTION_META: Record<
  FinanceSection,
  { title: string; description: string }
> = {
  expenses: {
    title: NAV_LABELS.expenses,
    description: "ثبت و پیگیری خرج‌های این فضا — تسویه و صورتحساب صفحهٔ جدا دارند.",
  },
  settlements: {
    title: NAV_LABELS.settlements,
    description: "ادعای تسویه، تأیید، اعتراض و لینک پرداخت.",
  },
  invoices: {
    title: NAV_LABELS.invoices,
    description: "دورهٔ هزینه و صورتحساب اعضا.",
  },
  recurring: {
    title: NAV_LABELS.recurring,
    description: "قواعد تکرار، گزارش بازه‌ای و نسخه‌بندی مبلغ.",
  },
};

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
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [invoices, setInvoices] = useState<MemberInvoiceSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<JournalEntrySummary[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
  const [devSubject, setDevSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [devDisplayName, setDevDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [title, setTitle] = useState("");
  const [amountToman, setAmountToman] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [split, setSplit] = useState<SplitComposerValue>(() => emptySplitComposer("shared"));
  const [expenseFilter, setExpenseFilter] = useState<"all" | ExpenseVisibility>("all");
  const [expensePeriodId, setExpensePeriodId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [costCenters, setCostCenters] = useState<CostCenterSummary[]>([]);
  const [settleToUserId, setSettleToUserId] = useState("");
  const [settleAmountToman, setSettleAmountToman] = useState("");
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
    (capabilities != null && capabilities.stubs.paymentProvider === false);
  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 4000);
  }
  function applyWorkspaceData(data: FinanceWorkspaceData) {
    setExpenses(data.expenses);
    setSettlements(data.settlements);
    setPaymentLinks(data.paymentLinks);
    setPeriods(data.periods);
    setSelectedPeriodId(data.activePeriodId);
    setInvoices(data.invoices);
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
            applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
            setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
          } else {
            setExpenses([]);
            setSettlements([]);
            setPaymentLinks([]);
            setPeriods([]);
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
        applyWorkspaceData(await loadWorkspaceData(selectedId));
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
  }, [chrome.ready, selectedId]);

  useEffect(() => {
    if (initialLoading || !selectedId) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
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
  }, [focusPanel, initialLoading, selectedId]);

  const {
    onCreateExpense,
    onSaveOfflineDraft,
    onSyncOfflineDraft,
    onCreateSettlement,
    onCreatePaymentLink,
    onConfirmSettlement,
    onDisputeSettlement,
    onCancelSettlement,
    onSubmitExpense,
    onPostExpense,
    onPromoteCompany,
    onCreatePeriod,
    onGenerateInvoices,
    onApproveInvoice,
    onDisputeInvoice,
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
    settleToUserId,
    settleAmountToman,
    periodTitle,
    periodKind,
    periodStartsOn,
    periodEndsOn,
    setOfflineDrafts,
    setLastDraftSavedAt,
    setSettlementNps,
  });
  function memberLabel(userId: string) {
    return members.find((member) => member.userId === userId)?.displayName ?? userId.slice(0, 8);
  }

  const myNetMinor = session?.actor
    ? (balances?.lines.find((line) => line.userId === session.actor?.userId)?.net.amountMinor ?? "0")
    : "0";
  const myNetToman = Math.round(Number(myNetMinor) / 10);
  const openSettlements = settlements.filter((s) => s.status === "claimed" || s.status === "disputed").length;
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
  const membersHref = slug ? wPath(slug, "members") : hubPathFor("/workspaces/invite");
  const settlementsHref = slug ? wPath(slug, "settlements") : hubPathFor("/workspaces");
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const invoicesHref = slug ? wPath(slug, "invoices") : hubPathFor("/workspaces");
  const meta = SECTION_META[section];
  const roleHint = myMembershipRole
    ? `نقش شما: ${membershipRoleLabel(myMembershipRole)}`
    : null;

  return (
    <AppShell
      workspaceId={chrome.workspaceId || selectedId}
      workspaceName={workspaces.find((w) => w.id === selectedId)?.name}
      userName={session?.actor?.displayName ?? devDisplayName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow={NAV_LABELS.sectionFinance}
        title={meta.title}
        description={
          selectedId
            ? [meta.description, roleHint, `${expenses.length} خرج · ${openSettlements} تسویه باز`]
                .filter(Boolean)
                .join(" · ")
            : "فضای کاری را انتخاب کنید یا بسازید تا جریان مالی زنده شود."
        }
      />
      <FlashMessages error={error} successMessage={successMessage} />
      {selectedId ? (
        <p className="liveHint" style={{ marginBottom: 12 }}>
          <button type="button" className="textButton" disabled={pending} onClick={refresh}>
            تازه‌سازی داده‌ها
          </button>
          {section !== "expenses" ? (
            <>
              {" · "}
              <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
            </>
          ) : null}
          {section !== "settlements" ? (
            <>
              {" · "}
              <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
            </>
          ) : null}
          {section !== "invoices" && canManageFinance ? (
            <>
              {" · "}
              <Link href={invoicesHref}>{NAV_LABELS.invoices}</Link>
            </>
          ) : null}
        </p>
      ) : null}

      {initialLoading ? (
        <EmptyHint loading>در حال بارگذاری فضاهای کاری…</EmptyHint>
      ) : workspaces.length === 0 ? (
        <EmptyHint>
          هنوز فضایی ندارید. از <Link href="/spaces/new">ساخت فضای کاری</Link> شروع کنید.
        </EmptyHint>
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
            <FinanceSummaryCard balances={balances} memberLabel={memberLabel} />
            <ExpenseListPanel
              filteredExpenses={filteredExpenses}
              expenseFilter={expenseFilter}
              onFilterChange={setExpenseFilter}
              supportsCompany={supportsCompany}
              canApproveCompany={canApproveCompany}
              selectedId={selectedId}
              pending={pending}
              canManageFinance={canManageFinance}
              readOnly={readOnlyFinance}
              onSubmitExpense={onSubmitExpense}
              onPostExpense={onPostExpense}
              onPromoteCompany={onPromoteCompany}
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
              members={members}
              settleToUserId={settleToUserId}
              onSettleToUserIdChange={setSettleToUserId}
              settleAmountToman={settleAmountToman}
              onSettleAmountTomanChange={setSettleAmountToman}
              settlements={settlements}
              paymentLinks={paymentLinks}
              paymentsLive={paymentsLive}
              readOnly={readOnlyFinance}
              pending={pending}
              settlementNps={settlementNps}
              onDismissNps={() => setSettlementNps(false)}
              memberLabel={memberLabel}
              membersHref={membersHref}
              onCreateSettlement={onCreateSettlement}
              onConfirmSettlement={onConfirmSettlement}
              onDisputeSettlement={onDisputeSettlement}
              onCancelSettlement={onCancelSettlement}
              onCreatePaymentLink={onCreatePaymentLink}
            />
          </ProductGrid>
        </>
      ) : null}

      {selectedId && section === "invoices" ? (
        <ProductGrid cols={2}>
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
            paymentLinks={paymentLinks}
            paymentsLive={paymentsLive}
            pending={pending}
            session={session}
            memberLabel={memberLabel}
            canManageInvoices={canManageFinance}
            onCreatePeriod={onCreatePeriod}
            onGenerateInvoices={onGenerateInvoices}
            onClosePeriod={onClosePeriod}
            onCancelPeriod={onCancelPeriod}
            onApproveInvoice={onApproveInvoice}
            onDisputeInvoice={onDisputeInvoice}
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
              onChanged={() => {
                void loadWorkspaceData(selectedId, selectedPeriodId).then(applyWorkspaceData);
              }}
            />
          </div>
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
    </AppShell>
  );
}
