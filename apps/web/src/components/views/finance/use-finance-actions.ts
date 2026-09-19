"use client";

import { newClientId } from "@/lib/id";

import type {
  PeriodKind,
  SettlementSummary,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import {
  buildSplitPayloadFromComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import {
  listOfflineExpenseDrafts,
  removeOfflineExpenseDraft,
  saveOfflineExpenseDraft,
  type OfflineExpenseDraft,
} from "@/lib/offline-drafts";
import {
  loadWorkspaceData,
  type FinanceLoadScope,
  type FinanceWorkspaceData,
} from "@/components/views/finance/use-finance-data";

/**
 * Dependencies the finance-action handlers read/write. Owned by FinanceView state;
 * passed in so the handlers stay pure closures over the current render values.
 */
export type FinanceActionsDeps = {
  startTransition: (callback: () => void) => void;
  selectedId: string;
  selectedPeriodId: string;
  /** Which finance route section is active - scopes reload fetches. */
  loadScope: FinanceLoadScope;
  applyWorkspaceData: (data: FinanceWorkspaceData) => void;
  showSuccess: (message: string) => void;
  setError: (message: string | null) => void;
  setSelectedPeriodId: (value: string) => void;
  title: string;
  setTitle: (value: string) => void;
  amountToman: string;
  setAmountToman: (value: string) => void;
  expenseDate: string;
  split: SplitComposerValue;
  expensePeriodId: string;
  costCenterId: string;
  missionKind: "" | "advance" | "settlement";
  requireCostCenter?: boolean;
  settleToUserId: string;
  settleAmountToman: string;
  periodTitle: string;
  periodKind: PeriodKind;
  periodStartsOn: string;
  periodEndsOn: string;
  setOfflineDrafts: (drafts: OfflineExpenseDraft[]) => void;
  setLastDraftSavedAt: (value: string | null) => void;
  setSettlementNps: (value: boolean) => void;
  /** When set, submit uses reviseExpense instead of create. */
  revisingExpenseId: string | null;
  setRevisingExpenseId: (value: string | null) => void;
  reviseReason: string;
  setReviseReason: (value: string) => void;
  fundingSourceKind: "" | "personal" | "petty_cash";
  fundingRefId: string;
  /** Current balances for settle-link from debtor line. */
  balances: WorkspaceBalancesResponse | null;
  /** When false, issue invoice without creating checkout link. */
  paymentsLive?: boolean;
};

/**
 * All finance write-action handlers (create expense/settlement/period, invoices,
 * offline drafts, ...). Extracted from finance-view.tsx to keep the view lean;
 * behavior is identical - driven entirely by the passed-in deps.
 */
export function useFinanceActions(deps: FinanceActionsDeps) {
  const {
    startTransition,
    selectedId,
    selectedPeriodId,
    loadScope,
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
    requireCostCenter = false,
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
    paymentsLive = false,
  } = deps;

  /**
   * Server-pushed refresh: when someone else's expense hits the ledger, the
   * balances / invoices on this screen reload immediately instead of on a timer.
   */
  useLiveInvalidation(
    ["expenses", "balances", "statements", "invoices:", "periods", "settlements"],
    () => {
      if (!selectedId) return;
      void (async () => {
        try {
          applyWorkspaceData(
            await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope),
          );
        } catch {
          // Keep the last good data on screen; the next push retries.
        }
      })();
    },
  );

  function onCreateExpense() {
    if (!selectedId) return;
    const titleTrim = title.trim();
    if (!titleTrim) {
      setError("عنوان خرج را وارد کنید");
      return;
    }
    if (requireCostCenter && !costCenterId.trim()) {
      setError("مرکز هزینه برای این فضا اجباری است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          const privateAssignee =
            split.visibility === "private"
              ? (split.participantUserIds[0] ?? me.actor.userId)
              : null;
          const payload = buildSplitPayloadFromComposer(
            split.visibility === "private"
              ? {
                  ...split,
                  splitMethod: "equal",
                  participantUserIds: privateAssignee ? [privateAssignee] : [me.actor.userId],
                }
              : split,
          );
          const total =
            payload.totalMinor != null
              ? { amountMinor: payload.totalMinor, currency: "IRR" as const }
              : tomanInputToIrrMinor(amountToman);
          if (!total) {
            setError("مبلغ معتبر وارد کنید (تومان)");
            return;
          }
          const participants =
            split.visibility === "private"
              ? [privateAssignee ?? me.actor.userId]
              : payload.participantUserIds;
          if (participants.length === 0) {
            setError("حداقل یک سهیم‌کننده لازم است");
            return;
          }
          const paidByUserId =
            split.visibility === "private"
              ? (privateAssignee ?? me.actor.userId)
              : (payload.paidByUserId?.trim() ||
                  split.paidByUserId?.trim() ||
                  me.actor.userId);
          if (payload.paymentLines && payload.paymentLines.length > 0) {
            const sum = payload.paymentLines.reduce(
              (acc, line) => acc + BigInt(line.amount.amountMinor),
              0n,
            );
            if (sum !== BigInt(total.amountMinor)) {
              setError("جمع مبلغ پرداخت‌کنندگان باید با کل خرج یکی باشد");
              return;
            }
          }
          const draftBody = {
            workspaceId: selectedId,
            title: titleTrim,
            total,
            paidByUserId,
            paymentLines: payload.paymentLines,
            splitMethod: payload.splitMethod,
            participantUserIds: participants,
            splitLines: payload.splitLines,
            items: payload.items,
            tip: payload.tip,
            tax: payload.tax,
            discount: payload.discount,
            formulaBasis: payload.formulaBasis,
            occurredOn: expenseDate,
            periodId: expensePeriodId || undefined,
            costCenterId: costCenterId || undefined,
            missionKind: missionKind || undefined,
            visibility: split.visibility,
            commit: "auto" as const,
            idempotencyKey: newClientId(),
            ...(fundingSourceKind === "petty_cash" && fundingRefId
              ? {
                  fundingSourceKind: "petty_cash" as const,
                  fundingRefId,
                }
              : fundingSourceKind === "personal"
                ? { fundingSourceKind: "personal" as const }
                : {}),
          };
          if (revisingExpenseId) {
            const result = await api.reviseExpense(selectedId, revisingExpenseId, {
              ...draftBody,
              reverseReason: reviseReason || "revise",
            });
            applyWorkspaceData(
              await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope),
            );
            setTitle("");
            setAmountToman("");
            setRevisingExpenseId(null);
            setReviseReason("");
            setError(null);
            showSuccess(
              result.created.status === "posted"
                ? "خرج اصلاح شد · جایگزین در دفترکل ثبت شد"
                : "خرج اصلاح شد · جایگزین در انتظار تأیید",
            );
            return;
          }
          const created = await api.createExpenseDraft(selectedId, draftBody);
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setTitle("");
          setAmountToman("");
          setError(null);
          showSuccess(
            created.status === "posted"
              ? "خرج ثبت شد · در دفترکل آمده و مانده‌ها به‌روز شد"
              : "خرج ثبت شد · در انتظار تأیید",
          );
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  function onSaveOfflineDraft() {
    if (!selectedId) return;
    if (!tomanInputToIrrMinor(amountToman) && split.splitMethod !== "itemized") {
      setError("مبلغ معتبر وارد کنید (تومان)");
      return;
    }
    const saved = saveOfflineExpenseDraft({
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
    setLastDraftSavedAt(saved.updatedAt);
    setError(null);
  }

  function onSyncOfflineDraft(draft: OfflineExpenseDraft) {
    if (!selectedId) return;
    const total = tomanInputToIrrMinor(draft.totalToman);
    if (!total) {
      setError("پیش‌نویس آفلاین مبلغ معتبری ندارد");
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
            commit: "auto",
            idempotencyKey: newClientId(),
          });
          removeOfflineExpenseDraft(draft.id);
          setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  function onCreateSettlement() {
    if (!selectedId || !settleToUserId) return;
    const amount = tomanInputToIrrMinor(settleAmountToman);
    if (!amount) {
      setError("مبلغ معتبر وارد کنید (تومان)");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          if (settleToUserId === me.actor.userId) {
            setError("طرف مقابل نمی‌تواند خود شما باشد");
            return;
          }
          await api.createSettlementClaim(selectedId, {
            workspaceId: selectedId,
            fromUserId: me.actor.userId,
            toUserId: settleToUserId,
            amount,
            note: "ادعای تسویه دستی",
            idempotencyKey: newClientId(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
          showSuccess("ادعای تسویه ثبت شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
                ? `${window.location.origin}${window.location.pathname}#settlement-panel`
                : "http://127.0.0.1/workspaces#settlement-panel",
            idempotencyKey: newClientId(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  /**
   * From a debtor balance line: claim against the largest creditor, then checkout link.
   * Gated in UI by paymentsLive (local_psp / zarinpal).
   */
  function onBalanceSettleLink(debtorUserId: string, debtAbsMinor: string) {
    if (!selectedId || !balances) return;
    const creditors = balances.lines
      .filter((l) => BigInt(l.net.amountMinor) > 0n)
      .sort((a, b) =>
        BigInt(a.net.amountMinor) > BigInt(b.net.amountMinor) ? -1 : 1,
      );
    const creditor = creditors[0];
    if (!creditor || creditor.userId === debtorUserId) {
      setError("طلبکاری برای ساخت لینک تسویه پیدا نشد");
      return;
    }
    const debt = BigInt(debtAbsMinor);
    const credit = BigInt(creditor.net.amountMinor);
    const payAmount = (debt < credit ? debt : credit).toString();
    if (BigInt(payAmount) <= 0n) {
      setError("مبلغ تسویه نامعتبر است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const claim = await api.createSettlementClaim(selectedId, {
            workspaceId: selectedId,
            fromUserId: debtorUserId,
            toUserId: creditor.userId,
            amount: { amountMinor: payAmount, currency: "IRR" },
            note: "settle-link from balance",
            idempotencyKey: newClientId(),
          });
          await api.createPaymentLink(selectedId, {
            workspaceId: selectedId,
            settlementId: claim.id,
            amount: claim.amount,
            description: `تسویه مانده ${debtorUserId.slice(0, 8)}`,
            returnUrl:
              typeof window !== "undefined"
                ? `${window.location.origin}${window.location.pathname}#settlement-panel`
                : "http://127.0.0.1/workspaces#settlement-panel",
            idempotencyKey: newClientId(),
          });
          applyWorkspaceData(
            await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope),
          );
          setError(null);
          showSuccess("ادعای تسویه و لینک پرداخت ساخته شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت لینک تسویه ناموفق بود"));
        }
      })();
    });
  }

  function onConfirmSettlement(
    settlementId: string,
    evidence?: {
      evidenceKind?: "receipt" | "cash_ack" | "gateway";
      receiptId?: string;
      cashAckNote?: string;
    },
  ) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.confirmSettlement(
            selectedId,
            settlementId,
            evidence ?? {
              evidenceKind: "cash_ack",
              cashAckNote: "تسویه نقدی / حضوری تأیید شد",
            },
          );
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
          showSuccess("تسویه تأیید شد");
          setSettlementNps(true);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
          showSuccess("خرج در دفترکل ثبت شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
          showSuccess("خرج به حالت شرکتی ارتقا یافت");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ارتقا به شرکتی ناموفق بود"));
        }
      })();
    });
  }

  function onReverseExpense(expenseId: string, reason: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.reverseExpense(selectedId, expenseId, {
            reason: reason.trim() || "mistaken_entry",
            idempotencyKey: newClientId(),
          });
          applyWorkspaceData(
            await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope),
          );
          setError(null);
          showSuccess("خرج برگشت داده شد · مانده‌ها اصلاح شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "برگشت خرج ناموفق بود"));
        }
      })();
    });
  }

  function onCancelRevise() {
    setRevisingExpenseId(null);
    setReviseReason("");
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
            title: periodTitle.trim() || "دوره مالی",
            kind: periodKind,
            startsOn,
            endsOn,
            idempotencyKey: newClientId(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId, period.id, undefined, loadScope));
          setError(null);
          showSuccess("دوره مالی ایجاد شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  function onDisputeInvoice(invoiceId: string) {
    if (!selectedId) return;
    const note = window.prompt("دلیل اعتراض به صورتحساب:");
    if (!note?.trim()) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.disputeInvoice(selectedId, invoiceId, note.trim());
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  function onResolveInvoiceDispute(
    invoiceId: string,
    outcome: "accepted" | "rejected",
  ) {
    if (!selectedId) return;
    const note = window.prompt(
      outcome === "accepted"
        ? "توضیح پذیرش اعتراض (اختیاری):"
        : "دلیل رد اعتراض (اختیاری):",
    );
    if (note === null) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.resolveInvoiceDispute(selectedId, invoiceId, outcome, note);
          applyWorkspaceData(
            await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope),
          );
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "رفع اختلاف صورتحساب ناموفق بود"));
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
          if (paymentsLive) {
            await api.createPaymentLink(selectedId, {
              workspaceId: selectedId,
              invoiceId,
              amount: issued.total,
              description: `صورتحساب ${invoiceId.slice(0, 8)}`,
              returnUrl:
                typeof window !== "undefined"
                  ? `${window.location.origin}${window.location.pathname}#period-invoice-panel`
                  : "http://127.0.0.1/workspaces#period-invoice-panel",
              idempotencyKey: `invoice-issue:${invoiceId}`,
            });
          }
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
          showSuccess(
            paymentsLive
              ? "صورتحساب صادر و لینک پرداخت ساخته شد"
              : "صورتحساب صادر شد (درگاه آنلاین غیرفعال)",
          );
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
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
          applyWorkspaceData(await loadWorkspaceData(selectedId, selectedPeriodId, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  function onSelectPeriodId(next: string) {
    setSelectedPeriodId(next);
    startTransition(() => {
      void (async () => {
        try {
          applyWorkspaceData(await loadWorkspaceData(selectedId, next, undefined, loadScope));
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "عملیات ناموفق بود"));
        }
      })();
    });
  }

  function onRemoveOfflineDraft(draftId: string) {
    removeOfflineExpenseDraft(draftId);
    setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
  }

  return {
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
  };
}
