"use client";

import { newClientId } from "@/lib/id";

import type { PeriodKind, SettlementSummary } from "@dang/contracts";
import {
  buildSplitPayloadFromComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import {
  listOfflineExpenseDrafts,
  removeOfflineExpenseDraft,
  saveOfflineExpenseDraft,
  type OfflineExpenseDraft,
} from "@/lib/offline-drafts";
import {
  loadWorkspaceData,
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
  settleToUserId: string;
  settleAmountToman: string;
  periodTitle: string;
  periodKind: PeriodKind;
  periodStartsOn: string;
  periodEndsOn: string;
  setOfflineDrafts: (drafts: OfflineExpenseDraft[]) => void;
  setLastDraftSavedAt: (value: string | null) => void;
  setSettlementNps: (value: boolean) => void;
};

/**
 * All finance write-action handlers (create expense/settlement/period, invoices,
 * offline drafts, …). Extracted from finance-view.tsx to keep the view lean;
 * behavior is identical — driven entirely by the passed-in deps.
 */
export function useFinanceActions(deps: FinanceActionsDeps) {
  const {
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
  } = deps;

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
            setError("مبلغ تومان نامعتبر است (فقط IRR)");
            return;
          }
          const participants =
            split.visibility === "private"
              ? [privateAssignee ?? me.actor.userId]
              : payload.participantUserIds;
          if (participants.length === 0) {
            setError("حداقل یک شرکت‌کننده لازم است");
            return;
          }
          const created = await api.createExpenseDraft(selectedId, {
            workspaceId: selectedId,
            title: titleTrim,
            total,
            paidByUserId: privateAssignee ?? me.actor.userId,
            splitMethod: payload.splitMethod,
            participantUserIds: participants,
            splitLines: payload.splitLines,
            items: payload.items,
            tip: payload.tip,
            tax: payload.tax,
            discount: payload.discount,
            occurredOn: expenseDate,
            periodId: expensePeriodId || undefined,
            costCenterId: costCenterId || undefined,
            visibility: split.visibility,
            idempotencyKey: newClientId(),
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
            idempotencyKey: newClientId(),
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
            idempotencyKey: newClientId(),
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
                ? `${window.location.origin}${window.location.pathname}#settlement-panel`
                : "http://127.0.0.1/workspaces#settlement-panel",
            idempotencyKey: newClientId(),
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
          setSettlementNps(true);
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
            idempotencyKey: newClientId(),
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
                ? `${window.location.origin}${window.location.pathname}#period-invoice-panel`
                : "http://127.0.0.1/workspaces#period-invoice-panel",
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

  function onSelectPeriodId(next: string) {
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
  };
}
