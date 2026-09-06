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
  SessionSummary,
  SettlementSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField, formatToman } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import { JalaliDateField } from "@/components/jalali-date-field";
import {
  SplitComposer,
  buildSplitPayloadFromComposer,
  emptySplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  HeroBalance,
  PageHeader,
  ProductGrid,
  QuickAction,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity, type AuditEventDto, type SystemCapabilities } from "@/lib/api";
import { ExpenseReceiptUpload } from "@/components/expense-receipt-upload";
import { WorkspaceReportsPanel } from "@/components/workspace-reports-panel";
import { hubPathFor } from "@/lib/hub-links";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  auditResultLabel,
  expenseStatusLabel,
  expenseVisibilityLabel,
  invoiceStatusLabel,
  periodStatusLabel,
  settlementStatusLabel,
  zeroSumHint,
} from "@/lib/status-labels";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";
import { useAppChrome } from "@/lib/use-app-chrome";
import {
  listOfflineExpenseDrafts,
  removeOfflineExpenseDraft,
  saveOfflineExpenseDraft,
  type OfflineExpenseDraft,
} from "@/lib/offline-drafts";
import { FinanceSummaryCard } from "@/components/views/finance/finance-summary-card";
import {
  loadWorkspaceData,
  type FinanceWorkspaceData,
} from "@/components/views/finance/use-finance-data";

export function FinanceView() {
  const chrome = useAppChrome();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
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
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [devSubject, setDevSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [devDisplayName, setDevDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [title, setTitle] = useState("");
  const [amountToman, setAmountToman] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [split, setSplit] = useState<SplitComposerValue>(() => emptySplitComposer("shared"));
  const [expenseFilter, setExpenseFilter] = useState<"all" | ExpenseVisibility>("all");
  const [expensePeriodId, setExpensePeriodId] = useState("");
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
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
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
          const [list, nextSession] = await Promise.all([api.listWorkspaces(), api.session()]);
          setSession(nextSession);
          setWorkspaces(list);
          const nextId =
            selectedId && list.some((item) => item.id === selectedId)
              ? selectedId
              : (list[0]?.id ?? "");
          setSelectedId(nextId);
          if (nextId) {
            applyWorkspaceData(await loadWorkspaceData(nextId, selectedPeriodId));
            setOfflineDrafts(listOfflineExpenseDrafts(nextId));
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
    void (async () => {
      try {
        const identity = getDevIdentity();
        setDevSubject(identity.subject);
        setDevDisplayName(identity.displayName);
        setDevIdentity(identity.subject, identity.displayName);
        const [list, nextSession] = await Promise.all([api.listWorkspaces(), api.session()]);
        if (cancelled) return;
        setSession(nextSession);
        void api.capabilities().then((caps) => {
          if (!cancelled) setCapabilities(caps);
        });
        setWorkspaces(list);
        const preferred =
          (chrome.workspaceId && list.some((item) => item.id === chrome.workspaceId)
            ? chrome.workspaceId
            : null) ??
          list[0]?.id ??
          "";
        setSelectedId(preferred);
        if (preferred) {
          applyWorkspaceData(await loadWorkspaceData(preferred));
          if (!cancelled) setOfflineDrafts(listOfflineExpenseDrafts(preferred));
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
  }, [chrome.workspaceId]);
  function onCreateExpense() {
    if (!selectedId) return;
    const titleTrim = title.trim();
    if (!titleTrim) {
      setError("عنوان خرج را وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          const payload = buildSplitPayloadFromComposer(
            split.visibility === "private"
              ? { ...split, splitMethod: "equal", participantUserIds: [me.actor.userId] }
              : split,
          );
          const total =
            payload.totalMinor != null
              ? { amountMinor: payload.totalMinor, currency: "IRR" as const }
              : tomanInputToIrrMinor(amountToman);
          if (!total) {
            setError("مبلغ تومان نامعتبر است (فقط IRR)");
            return;
          }
          const participants =
            split.visibility === "private" ? [me.actor.userId] : payload.participantUserIds;
          if (participants.length === 0) {
            setError("حداقل یک شرکت‌کننده لازم است");
            return;
          }
          const created = await api.createExpenseDraft(selectedId, {
            workspaceId: selectedId,
            title: titleTrim,
            total,
            paidByUserId: me.actor.userId,
            splitMethod: payload.splitMethod,
            participantUserIds: participants,
            splitLines: payload.splitLines,
            items: payload.items,
            tip: payload.tip,
            tax: payload.tax,
            discount: payload.discount,
            occurredOn: expenseDate,
            periodId: expensePeriodId || undefined,
            visibility: split.visibility,
            idempotencyKey: crypto.randomUUID(),
          });
          if (split.visibility === "company") {
            await api.submitExpense(selectedId, created.id);
          } else {
            await api.submitExpense(selectedId, created.id);
            await api.postExpense(selectedId, created.id);
          }
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setTitle("");
          setAmountToman("");
          setError(null);
          showSuccess(
            split.visibility === "company"
              ? "خرج شرکتی ثبت شد و منتظر تأیید است"
              : "خرج ثبت شد · روی مانده اعضا اعمال شد",
          );
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onSaveOfflineDraft() {
    if (!selectedId) return;
    if (!tomanInputToIrrMinor(amountToman) && split.splitMethod !== "itemized") {
      setError("مبلغ تومان نامعتبر است (فقط IRR)");
      return;
    }
    saveOfflineExpenseDraft({
      workspaceId: selectedId,
      title,
      totalToman: amountToman,
      participantUserIds: split.participantUserIds,
      splitMethod: split.splitMethod === "itemized" ? "equal" : split.splitMethod,
      occurredOn: expenseDate,
      periodId: expensePeriodId || undefined,
      visibility: split.visibility,
    });
    setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
    setError(null);
  }
  function onSyncOfflineDraft(draft: OfflineExpenseDraft) {
    if (!selectedId) return;
    const total = tomanInputToIrrMinor(draft.totalToman);
    if (!total) {
      setError("پیش‌نویس آفلاین مبلغ نامعتبر دارد");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          await api.createExpenseDraft(selectedId, {
            workspaceId: selectedId,
            title: draft.title,
            total,
            paidByUserId: me.actor.userId,
            splitMethod: draft.splitMethod,
            participantUserIds:
              draft.participantUserIds.length > 0
                ? draft.participantUserIds
                : split.participantUserIds,
            occurredOn: draft.occurredOn,
            note: draft.note,
            periodId: draft.periodId,
            visibility: draft.visibility,
            idempotencyKey: crypto.randomUUID(),
          });
          removeOfflineExpenseDraft(draft.id);
          setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onCreateSettlement() {
    if (!selectedId || !settleToUserId) return;
    const amount = tomanInputToIrrMinor(settleAmountToman);
    if (!amount) {
      setError("مبلغ تسویه نامعتبر است (فقط IRR)");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          if (settleToUserId === me.actor.userId) {
            setError("طرف تسویه باید شخص دیگری باشد");
            return;
          }
          await api.createSettlementClaim(selectedId, {
            workspaceId: selectedId,
            fromUserId: me.actor.userId,
            toUserId: settleToUserId,
            amount,
            note: "تسویه مانده گروه",
            idempotencyKey: crypto.randomUUID(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
          showSuccess("ادعای تسویه ثبت شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onCreatePaymentLink(settlement: SettlementSummary) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.createPaymentLink(selectedId, {
            workspaceId: selectedId,
            settlementId: settlement.id,
            amount: settlement.amount,
            description: `تسویه ${settlement.id.slice(0, 8)}`,
            returnUrl:
              typeof window !== "undefined"
                ? `${window.location.origin}/workspaces`
                : "http://localhost:3005/workspaces",
            idempotencyKey: crypto.randomUUID(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onConfirmSettlement(settlementId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.confirmSettlement(selectedId, settlementId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
          showSuccess("تسویه تأیید شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onDisputeSettlement(settlementId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.disputeSettlement(selectedId, settlementId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onCancelSettlement(settlementId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.cancelSettlement(selectedId, settlementId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onSubmitExpense(expenseId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.submitExpense(selectedId, expenseId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onPostExpense(expenseId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.postExpense(selectedId, expenseId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
          showSuccess("هزینه در دفتر ثبت شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onPromoteCompany(expenseId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.promoteExpenseCompany(selectedId, expenseId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
          showSuccess("خرج خصوصی به شرکتی تأیید شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "تأیید شرکتی ناموفق"));
        }
      })();
    });
  }
  function onCreatePeriod() {
    if (!selectedId) return;
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(periodStartsOn);
    if (periodKind === "week") end.setDate(end.getDate() + 6);
    else if (periodKind === "month") end.setMonth(end.getMonth() + 1);
    else if (periodKind === "year") end.setFullYear(end.getFullYear() + 1);
    const computedEndsOn = end.toISOString().slice(0, 10);
    const startsOn = periodKind === "custom" ? periodStartsOn : today;
    const endsOn =
      periodKind === "day"
        ? startsOn
        : periodKind === "custom"
          ? periodEndsOn
          : computedEndsOn;
    startTransition(() => {
      void (async () => {
        try {
          const period = await api.createPeriod(selectedId, {
            workspaceId: selectedId,
            title: periodTitle.trim() || "دوره هزینه",
            kind: periodKind,
            startsOn,
            endsOn,
            idempotencyKey: crypto.randomUUID(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, period.id));
          setError(null);
          showSuccess("دوره هزینه ساخته شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onGenerateInvoices() {
    if (!selectedId || !selectedPeriodId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.generatePeriodInvoices(selectedId, selectedPeriodId, {
            sendForApproval: true,
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onApproveInvoice(invoiceId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.approveInvoice(selectedId, invoiceId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onDisputeInvoice(invoiceId: string) {
    if (!selectedId) return;
    const note = window.prompt("دلیل اعتراض را بنویسید:");
    if (!note?.trim()) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.disputeInvoice(selectedId, invoiceId, note.trim());
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onIssueInvoice(invoiceId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          const issued = await api.issueInvoice(selectedId, invoiceId);
          await api.createPaymentLink(selectedId, {
            workspaceId: selectedId,
            invoiceId,
            amount: issued.total,
            description: `صورتحساب ${invoiceId.slice(0, 8)}`,
            returnUrl:
              typeof window !== "undefined"
                ? `${window.location.origin}/workspaces`
                : "http://localhost:3005/workspaces",
            idempotencyKey: `invoice-issue:${invoiceId}`,
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onMarkInvoicePaid(invoiceId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.markInvoicePaid(selectedId, invoiceId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onClosePeriod() {
    if (!selectedId || !selectedPeriodId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.closePeriod(selectedId, selectedPeriodId, { requireAllPaid: true });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
  function onCancelPeriod() {
    if (!selectedId || !selectedPeriodId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.cancelPeriod(selectedId, selectedPeriodId);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }
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
  const canApproveCompany =
    !!myMembershipRole &&
    ["owner", "admin", "approver", "finance"].includes(myMembershipRole);
  const filteredExpenses =
    expenseFilter === "all"
      ? expenses
      : expenses.filter((expense) => expense.visibility === expenseFilter);

  return (
    <AppShell
      workspaceId={chrome.workspaceId || selectedId}
      workspaceName={workspaces.find((w) => w.id === selectedId)?.name}
      userName={session?.actor?.displayName ?? devDisplayName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="ماژول مالی"
        title="هزینه، مانده و تسویه"
        description={
          selectedId
            ? `مادرخرج: خرج ثبت کنید تا اعضا سهم را ببینند · ${expenses.length} هزینه · ${openSettlements} تسویه باز`
            : "فضای کاری را انتخاب کنید یا بسازید تا جریان مالی زنده شود."
        }
        actions={
          <>
            <a href="#expense-panel">ثبت خرج</a>
            <a href="#settlement-panel">تسویه</a>
            <Link href={hubPathFor("/workspaces/invite")}>دعوت عضو</Link>
            <Link href={hubPathFor("/daily-ledger")}>دفتر روزانه</Link>
            <button type="button" disabled={pending} onClick={refresh}>
              تازه‌سازی
            </button>
          </>
        }
      />
      {error ? <p className="liveError">{error}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

      {initialLoading ? (
        <EmptyHint>در حال بارگذاری فضاهای کاری…</EmptyHint>
      ) : workspaces.length > 0 ? (
        <div className="workspaceChipRow" style={{ marginBottom: 18 }}>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={workspace.id === selectedId ? "workspaceChip active" : "workspaceChip"}
              onClick={() => {
                chrome.selectWorkspace(workspace.id);
              }}
            >
              {workspace.name} · {workspace.template}
            </button>
          ))}
        </div>
      ) : (
        <EmptyHint>
          هنوز فضایی ندارید. از <Link href={hubPathFor("/onboarding")}>ساخت فضای کاری</Link> شروع کنید.
        </EmptyHint>
      )}

      {selectedId ? (
        <>
          <div className="heroGrid">
            <HeroBalance
              label="مانده خالص شما"
              amount={formatToman(myNetToman)}
              subtitle={myNetToman >= 0 ? "تومان طلب دارید" : "تومان بدهکارید"}
              actionLabel="رفتن به تسویه"
              onAction={() => {
                document.getElementById("settlement-panel")?.scrollIntoView({ behavior: "smooth" });
              }}
              hint={balances ? zeroSumHint(balances.zeroSum) : "…"}
            />
            <QuickAction
              title="ثبت خرج گروه"
              description="شما پرداخت می‌کنید؛ سهم اعضا روی مانده می‌نشیند."
              delayClass="delay1"
              icon={<ShellIconSvg name="receipt" />}
              onClick={() => document.getElementById("expense-panel")?.scrollIntoView({ behavior: "smooth" })}
            />
            <QuickAction
              title="تسویه و تأیید"
              description="اعضا سهم را می‌بینند، تأیید و پرداخت می‌کنند."
              delayClass="delay2"
              icon={<ShellIconSvg name="wallet" />}
              onClick={() => document.getElementById("settlement-panel")?.scrollIntoView({ behavior: "smooth" })}
            />
          </div>

          <ProductGrid cols={2}>
            <FinanceSummaryCard balances={balances} memberLabel={memberLabel} />

            <SectionCard title="هزینه‌های اخیر" badge={filteredExpenses.length} delayClass="delay2">
              <div className="expenseFilterRow" role="tablist" aria-label="فیلتر نوع خرج">
                {(
                  [
                    ["all", "همه"],
                    ["shared", "جمعی"],
                    ["private", "خصوصی"],
                    ...(supportsCompany ? [["company", "شرکتی"] as const] : []),
                  ] as Array<["all" | ExpenseVisibility, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={expenseFilter === key}
                    className={expenseFilter === key ? "expenseFilter active" : "expenseFilter"}
                    onClick={() => setExpenseFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <DataList>
                {filteredExpenses.length === 0 ? <EmptyHint>هزینه‌ای ثبت نشده.</EmptyHint> : null}
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
                    }
                  />
                ))}
              </DataList>
            </SectionCard>
          </ProductGrid>

          <ProductGrid cols={2}>
            <SectionCard title="دوره هزینه (روز/هفته/ماه/سال)" badge={periods.length} delayClass="delay2">
              <FormStack>
                <TextField
                  label="عنوان دوره"
                  value={periodTitle}
                  onChange={(event) => setPeriodTitle(event.target.value)}
                />
                <SelectField
                  label="نوع دوره"
                  value={periodKind}
                  onChange={(event) => setPeriodKind(event.target.value as PeriodKind)}
                >
                  <option value="day">روز</option>
                  <option value="week">هفته</option>
                  <option value="month">ماه</option>
                  <option value="year">سال</option>
                  <option value="custom">سفارشی</option>
                </SelectField>
                {periodKind === "custom" ? (
                  <>
                    <JalaliDateField
                      label="شروع دوره"
                      value={periodStartsOn}
                      onChange={setPeriodStartsOn}
                    />
                    <JalaliDateField
                      label="پایان دوره"
                      value={periodEndsOn}
                      onChange={setPeriodEndsOn}
                    />
                  </>
                ) : null}
                <Button type="button" onClick={onCreatePeriod} disabled={pending}>
                  ساخت دوره
                </Button>
              </FormStack>
              {periods.length > 0 ? (
                <SelectField
                  label="دوره فعال"
                  value={selectedPeriodId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSelectedPeriodId(next);
                    startTransition(() => {
                      void (async () => {
                        try {
                          applyWorkspaceData(await loadWorkspaceData(selectedId, next));
                          setError(null);
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
                        }
                      })();
                    });
                  }}
                >
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.title} · {period.kind} · {periodStatusLabel(period.status)}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <EmptyHint>هنوز دوره‌ای نیست — یک هفته بسازید.</EmptyHint>
              )}
              <div className="dataRowActions">
                <Button
                  type="button"
                  onClick={onGenerateInvoices}
                  disabled={pending || !selectedPeriodId}
                >
                  تولید صورتحساب اعضا
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClosePeriod}
                  disabled={pending || !selectedPeriodId}
                >
                  بستن دوره
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancelPeriod}
                  disabled={pending || !selectedPeriodId}
                >
                  لغو دوره
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="صورتحساب اعضا" badge={invoices.length} delayClass="delay2">
              <DataList>
                {invoices.length === 0 ? (
                  <EmptyHint>صورتحسابی نیست — هزینهٔ دوره را ثبت و تولید کنید.</EmptyHint>
                ) : null}
                {invoices.map((invoice) => {
                  const isMine = session?.actor?.userId === invoice.memberUserId;
                  const invoicePaymentLink = paymentLinks.find(
                    (link) => link.invoiceId === invoice.id,
                  );
                  return (
                    <DataRow
                      key={invoice.id}
                      title={memberLabel(invoice.memberUserId)}
                      meta={
                        <>
                          <StatusPill
                            tone={
                              invoice.status === "issued" || invoice.status === "approved"
                                ? "ok"
                                : invoice.status === "disputed"
                                  ? "warn"
                                  : "gold"
                            }
                          >
                            {invoiceStatusLabel(invoice.status)}
                          </StatusPill>
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>
                            عمومی <Amount irrMinor={invoice.sharedTotal.amountMinor} /> · خصوصی{" "}
                            <Amount irrMinor={invoice.privateTotal.amountMinor} />
                          </span>
                          {invoice.lines.length > 0 ? (
                            <span style={{ color: "var(--muted)", fontSize: 12, display: "block" }}>
                              {invoice.lines
                                .map(
                                  (line) =>
                                    `${line.title} (${line.visibility === "private" ? "خصوصی" : "عمومی"})`,
                                )
                                .join(" · ")}
                            </span>
                          ) : null}
                        </>
                      }
                      trailing={<Amount irrMinor={invoice.total.amountMinor} />}
                      actions={
                        <>
                          {isMine && invoice.status === "pending_approval" ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onApproveInvoice(invoice.id)}
                                disabled={pending}
                              >
                                تأیید
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onDisputeInvoice(invoice.id)}
                                disabled={pending}
                              >
                                اعتراض
                              </Button>
                            </>
                          ) : null}
                        {invoice.status === "approved" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onIssueInvoice(invoice.id)}
                            disabled={pending}
                          >
                            صدور
                          </Button>
                        ) : null}
                        {invoice.status === "issued" ? (
                          <>
                            {invoicePaymentLink && paymentsLive ? (
                              <a
                                href={invoicePaymentLink.checkoutUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ghostLink"
                              >
                                پرداخت آنلاین
                              </a>
                            ) : invoicePaymentLink ? (
                              <span className="liveHint">پرداخت آنلاین منتظر PSP واقعی</span>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => onMarkInvoicePaid(invoice.id)}
                              disabled={pending}
                            >
                              پرداخت شد
                            </Button>
                          </>
                        ) : null}
                        </>
                      }
                    />
                  );
                })}
              </DataList>
            </SectionCard>
          </ProductGrid>

          <ProductGrid>
            <SectionCard title="ثبت خرج گروه (مادرخرج)" delayClass="delay3">
              <div id="expense-panel" />
              <FormStack>
                <StatusLine>
                  شما پرداخت می‌کنید؛ اعضا سهم مصرف را می‌بینند و بعداً از بخش تسویه تأیید/پرداخت
                  می‌کنند.
                </StatusLine>
                <TextField
                  label="عنوان"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  hint="مثلاً خرید هفته یا ناهار تیم"
                />
                <JalaliDateField label="تاریخ خرج" value={expenseDate} onChange={setExpenseDate} />
                {split.splitMethod !== "itemized" ? (
                  <TextField
                    label="مبلغ (تومان)"
                    value={amountToman}
                    onChange={(event) => setAmountToman(event.target.value)}
                  />
                ) : (
                  <p className="liveHint">
                    مبلغ کل از فاکتور آیتمی محاسبه می‌شود
                    {amountToman ? ` · ${amountToman} تومان` : ""}
                  </p>
                )}
                <SelectField
                  label="دوره (اختیاری)"
                  value={expensePeriodId}
                  onChange={(event) => setExpensePeriodId(event.target.value)}
                >
                  <option value="">بدون دوره</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.title}
                    </option>
                  ))}
                </SelectField>
                <SplitComposer
                  members={members}
                  totalToman={amountToman}
                  value={split}
                  onChange={setSplit}
                  supportsCompany={supportsCompany}
                  currentUserId={session?.actor?.userId}
                  onDerivedTotalToman={setAmountToman}
                />
                <div className="dataRowActions">
                  <Button type="button" onClick={onCreateExpense} disabled={pending}>
                    ثبت و اعمال روی مانده
                  </Button>
                  <Button type="button" variant="ghost" onClick={onSaveOfflineDraft} disabled={pending}>
                    ذخیره آفلاین
                  </Button>
                  <Link className="dlLinkBtn" href={hubPathFor("/daily-ledger")}>
                    دفتر روزانه
                  </Link>
                </div>
              </FormStack>
              {offlineDrafts.length > 0 ? (
                <DataList>
                  {offlineDrafts.map((draft) => (
                    <DataRow
                      key={draft.id}
                      title={draft.title}
                      meta={`${draft.totalToman} تومان`}
                      actions={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onSyncOfflineDraft(draft)}
                            disabled={pending}
                          >
                            همگام‌سازی
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              removeOfflineExpenseDraft(draft.id);
                              setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
                            }}
                          >
                            حذف
                          </Button>
                        </>
                      }
                    />
                  ))}
                </DataList>
              ) : null}
            </SectionCard>

            <SectionCard title="تسویه و تأیید اعضا" delayClass="delay3">
              <div id="settlement-panel" />
              <FormStack>
                <StatusLine>
                  عضو بدهکار ادعا ثبت می‌کند یا طلبکار پیشنهاد می‌دهد؛ طرف مقابل تأیید می‌کند.
                </StatusLine>
                <SelectField
                  label="طرف مقابل"
                  value={settleToUserId}
                  onChange={(event) => setSettleToUserId(event.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName} · {member.role}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="مبلغ تسویه (تومان)"
                  value={settleAmountToman}
                  onChange={(event) => setSettleAmountToman(event.target.value)}
                />
                <Button type="button" onClick={onCreateSettlement} disabled={pending || members.length < 2}>
                  ثبت ادعای تسویه
                </Button>
              </FormStack>
              {members.length < 2 ? (
                <EmptyHint>
                  برای تسویه حداقل دو عضو لازم است — از <Link href={hubPathFor("/workspaces/invite")}>دعوت</Link>{" "}
                  استفاده کنید.
                </EmptyHint>
              ) : null}
              <DataList>
                {settlements.map((settlement) => (
                  <DataRow
                    key={settlement.id}
                    title={`${memberLabel(settlement.fromUserId)} → ${memberLabel(settlement.toUserId)}`}
                    meta={
                      <StatusPill tone={settlement.status === "confirmed" ? "ok" : "gold"}>
                        {settlementStatusLabel(settlement.status)}
                      </StatusPill>
                    }
                    trailing={<Amount irrMinor={settlement.amount.amountMinor} />}
                    actions={
                      settlement.status === "claimed" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onConfirmSettlement(settlement.id)}
                            disabled={pending}
                          >
                            تأیید
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onDisputeSettlement(settlement.id)}
                            disabled={pending}
                          >
                            اعتراض
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onCancelSettlement(settlement.id)}
                            disabled={pending}
                          >
                            لغو
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onCreatePaymentLink(settlement)}
                            disabled={pending || !paymentsLive}
                            title={
                              paymentsLive
                                ? undefined
                                : "پرداخت آنلاین وقتی PSP واقعی تنظیم شود فعال می‌شود"
                            }
                          >
                            {paymentsLive ? "لینک پرداخت" : "پرداخت (غیرفعال)"}
                          </Button>
                        </>
                      ) : settlement.status === "disputed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onCancelSettlement(settlement.id)}
                          disabled={pending}
                        >
                          لغو
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </DataList>
              {paymentLinks.length > 0 ? (
                <DataList>
                  {paymentLinks.map((link) => (
                    <DataRow
                      key={link.id}
                      title={`پرداخت ${link.status}`}
                      meta={
                        paymentsLive ? (
                          <a href={link.checkoutUrl} target="_blank" rel="noreferrer">
                            صفحه پرداخت
                          </a>
                        ) : (
                          <span>لینک ذخیره‌شده — PSP واقعی هنوز وصل نیست</span>
                        )
                      }
                      trailing={<Amount irrMinor={link.amount.amountMinor} />}
                    />
                  ))}
                </DataList>
              ) : null}
            </SectionCard>
          </ProductGrid>

          <ProductGrid cols={2}>
            <SectionCard title="دفترکل" badge={ledgerEntries.length} delayClass="delay4">
              <DataList>
                {ledgerEntries.length === 0 ? (
                  <EmptyHint>هنوز ورودی دفتر نیست — هزینه را ثبت نهایی کنید.</EmptyHint>
                ) : null}
                {ledgerEntries.map((entry) => (
                  <DataRow
                    key={entry.id}
                    title={`${entry.sourceType}:${entry.sourceId.slice(0, 8)}`}
                    meta={entry.lines
                      .map((line) => `${line.side} ${memberLabel(line.userId)}`)
                      .join(" · ")}
                    trailing={`${entry.lines.length} خط`}
                  />
                ))}
              </DataList>
            </SectionCard>
            <SectionCard title="رویدادهای Audit" badge={auditEvents.length} delayClass="delay4">
              <DataList>
                {auditEvents.length === 0 ? <EmptyHint>رویدادی نیست.</EmptyHint> : null}
                {auditEvents.slice(0, 12).map((event) => (
                  <DataRow
                    key={event.id}
                    title={event.action}
                    meta={`${event.targetType} · ${auditResultLabel(event.result)}`}
                    trailing={
                      <StatusPill tone={event.result === "success" ? "ok" : "warn"}>
                        {auditResultLabel(event.result)}
                      </StatusPill>
                    }
                  />
                ))}
              </DataList>
            </SectionCard>
          </ProductGrid>

          {selectedId ? (
            <ProductGrid>
              <WorkspaceReportsPanel
                workspaceId={selectedId}
                defaultVisibility={supportsCompany ? "company" : "shared"}
                onChanged={() => {
                  void loadWorkspaceData(selectedId, selectedPeriodId).then(applyWorkspaceData);
                }}
              />
            </ProductGrid>
          ) : null}
        </>
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
