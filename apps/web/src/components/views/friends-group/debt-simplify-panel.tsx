"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  DebtSimplifySuggestionsResponse,
  SettlementSummary,
} from "@dang/contracts";
import {
  isDebtSimplifyClaimNote,
  isFundPartyId,
  previewBalancesAfterTransfers,
  settlementEdgeLabelFa,
} from "@dang/contracts";
import { Amount, Button, formatMoneyFromIrrMinor } from "@dang/ui";
import { DataList, DataRow, StatusLine } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { useDisplayUnit } from "@/lib/display-unit";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";

type Props = {
  workspaceId: string;
  memberLabel: (userId: string) => string;
  enabled: boolean;
  /** Current session user — used for creditor confirm step. */
  currentUserId?: string;
  /** Auditor/guest — suggestions without Apply/Confirm. */
  readOnly?: boolean;
  /** Who may POST simplify-claims (finance). Creditors still confirm when false. */
  canApplyClaims?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onApplied?: () => void;
  /** Opens the existing settle form for this edge. Does not post. */
  onOpenSettle?: (edge: {
    counterpartyUserId: string;
    amountMinor: string;
    /** True only when the signed-in member is the one who should pay. */
    actorPays: boolean;
  }) => void;
};

/** First-class simplify UI — only rendered when productFlags.debtSimplifyApi is on. */
export function DebtSimplifyPanel({
  workspaceId,
  memberLabel,
  enabled,
  currentUserId,
  readOnly = false,
  canApplyClaims = false,
  onError,
  onSuccess,
  onApplied,
  onOpenSettle,
}: Props) {
  const [payload, setPayload] = useState<DebtSimplifySuggestionsResponse | null>(
    null,
  );
  const [pendingClaims, setPendingClaims] = useState<SettlementSummary[]>([]);
  const [pending, startTransition] = useTransition();
  const displayUnit = useDisplayUnit();

  const refreshPending = useCallback(async () => {
    const listed = await api.listSettlements(workspaceId);
    setPendingClaims(
      listed.filter(
        (s) => s.status === "claimed" && isDebtSimplifyClaimNote(s.note),
      ),
    );
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setPayload(null);
      setPendingClaims([]);
      return;
    }
    void api
      .getDebtSimplifySuggestions(workspaceId)
      .then(setPayload)
      .catch((err: unknown) =>
        onError(friendlyErrorMessage(err, "بارگذاری پیشنهاد تسویه ناموفق")),
      );
    void refreshPending().catch(() => setPendingClaims([]));
  }, [enabled, workspaceId, onError, refreshPending]);

  const claimSelection = useRowSelection(pendingClaims.map((s) => s.id));

  if (!enabled) {
    return null;
  }

  const suggestions = payload?.suggestions ?? [];
  const projected =
    payload && suggestions.length > 0
      ? previewBalancesAfterTransfers(payload.lines, suggestions)
      : [];
  const zeroSumOk = payload?.zeroSum !== false;
  const goldenOk = payload?.goldenRulesOk !== false;
  const canMaterialize =
    !readOnly && canApplyClaims && zeroSumOk && goldenOk && suggestions.length > 0;

  const myReceivables = currentUserId
    ? pendingClaims.filter((s) => s.toUserId === currentUserId)
    : [];
  const selectedConfirmable = claimSelection.selectedIds.filter((id) => {
    const s = pendingClaims.find((c) => c.id === id);
    if (!s) return false;
    if (currentUserId && s.toUserId === currentUserId) return true;
    return canApplyClaims;
  });

  function onApplyAll() {
    if (!canMaterialize) return;
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.createSimplifySettlementClaims(workspaceId, {
            idempotencyKey: newClientId(),
          });
          onSuccess(
            `ادعای تسویه ساخته شد: ${result.created.length} · ردشده تکراری: ${result.skipped}`,
          );
          onApplied?.();
          const next = await api.getDebtSimplifySuggestions(workspaceId);
          setPayload(next);
          await refreshPending();
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "ثبت ادعای ساده‌سازی ناموفق"));
        }
      })();
    });
  }

  function onConfirm(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.confirmSimplifySettlementClaims(workspaceId, {
            idempotencyKey: newClientId(),
            settlementIds: ids,
          });
          onSuccess(
            `تأیید شد: ${result.confirmed.length}` +
              (result.failed.length
                ? ` · رد/غیرمجاز: ${result.failed.length}`
                : ""),
          );
          onApplied?.();
          await refreshPending();
          const next = await api.getDebtSimplifySuggestions(workspaceId);
          setPayload(next);
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "تأیید ساده‌سازی ناموفق"));
        }
      })();
    });
  }

  if (suggestions.length === 0 && pendingClaims.length === 0) {
    return null;
  }

  return (
    <>
      {suggestions.length > 0 ? (
        <>
          <p className="liveHint">
            پیشنهاد تسویه حداقلی — بدهکار به طلبکار (عضو یا صندوق تنخواه)
            {payload
              ? payload.goldenRulesOk
                ? " · قوانین طلایی تأیید شد"
                : " · هشدار: قوانین طلایی برقرار نیست"
              : null}
            {payload && !payload.zeroSum
              ? " · هشدار: مانده‌ها صفرجمع نیستند — ثبت ادعا تا اصلاح ledger غیرفعال است"
              : null}
          </p>
          <DataList>
            {suggestions.map((s) => {
              const amountLabel = formatMoneyFromIrrMinor(s.amount.amountMinor, displayUnit);
              const shareText = `${memberLabel(s.fromUserId)} ${amountLabel} به ${memberLabel(s.toUserId)} بدهکار است`;
              const actorPays = Boolean(currentUserId && s.fromUserId === currentUserId);
              return (
                <DataRow
                  key={`${s.fromUserId}-${s.toUserId}-${s.amount.amountMinor}`}
                  title={settlementEdgeLabelFa({
                    fromPartyId: s.fromUserId,
                    toPartyId: s.toUserId,
                    memberLabel,
                  })}
                  meta={
                    <span className="dataRowActions">
                      {!readOnly ? (
                        <button
                          type="button"
                          className="textButton"
                          onClick={() => {
                            void navigator.clipboard.writeText(shareText);
                            onSuccess("متن تسویه کپی شد");
                          }}
                        >
                          کپی متن
                        </button>
                      ) : null}
                      {!readOnly && onOpenSettle ? (
                        <button
                          type="button"
                          className="textButton"
                          onClick={() => {
                            if (!actorPays) {
                              onSuccess(
                                `این مبلغ را ${memberLabel(s.fromUserId)} باید بپردازد. فرم پرداخت شما پر نشد.`,
                              );
                            } else {
                              onOpenSettle({
                                counterpartyUserId: s.toUserId,
                                amountMinor: s.amount.amountMinor,
                                actorPays: true,
                              });
                            }
                            document
                              .getElementById("settlement-panel")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          باز کردن تسویه
                        </button>
                      ) : null}
                    </span>
                  }
                  trailing={<Amount irrMinor={s.amount.amountMinor} />}
                />
              );
            })}
          </DataList>
          {projected.length > 0 ? (
            <StatusLine>
              پیش‌نمایش مانده پس از تأیید همه:{" "}
              {projected.map((line, index) => (
                <span key={line.userId}>
                  {index > 0 ? " · " : null}
                  {isFundPartyId(line.userId)
                    ? "صندوق تنخواه"
                    : memberLabel(line.userId)}{" "}
                  {BigInt(line.net.amountMinor) > 0n ? "طلب " : "بدهی "}
                  <Amount
                    irrMinor={
                      BigInt(line.net.amountMinor) < 0n
                        ? (-BigInt(line.net.amountMinor)).toString()
                        : line.net.amountMinor
                    }
                  />
                </span>
              ))}
            </StatusLine>
          ) : (
            <StatusLine>پس از تأیید همه، مانده‌ها صفر می‌شوند.</StatusLine>
          )}
          <div className="dataRowActions">
            {readOnly || !canApplyClaims ? (
              <p className="liveHint">
                {readOnly
                  ? "نقش شما فقط مشاهده دارد — ثبت ادعا فعال نیست."
                  : "ثبت ادعا فقط برای مدیر مالی است؛ اگر طلبکارید، بعد از ثبت می‌توانید تأیید کنید."}
              </p>
            ) : (
              <Button
                type="button"
                onClick={onApplyAll}
                disabled={pending || !canMaterialize}
              >
                ۱) ثبت همه به‌عنوان ادعای تسویه
              </Button>
            )}
          </div>
        </>
      ) : null}

      {pendingClaims.length > 0 ? (
        <>
          <p className="liveHint">
            ادعاهای باز ساده‌سازی — طلبکار تأیید می‌کند؛ مدیر مالی فقط با چهارچشم (غیر از سازنده) می‌تواند تأیید گروهی کند.
          </p>
          {!readOnly ? (
            <SelectionActionBar
              selectedCount={claimSelection.selectedCount}
              idleHint="روی ردیف کلیک کنید یا مربع کنار ادعا را تیک بزنید"
              onClear={claimSelection.clear}
            >
              <button
                type="button"
                disabled={pending || selectedConfirmable.length === 0}
                onClick={() => {
                  onConfirm(selectedConfirmable);
                  claimSelection.clear();
                }}
              >
                تأیید انتخاب‌شده
                {selectedConfirmable.length > 0
                  ? ` (${selectedConfirmable.length.toLocaleString("fa-IR")})`
                  : ""}
              </button>
              {myReceivables.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onConfirm(myReceivables.map((s) => s.id))}
                >
                  تأیید طلب‌های من ({myReceivables.length.toLocaleString("fa-IR")})
                </button>
              ) : null}
              {canApplyClaims ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onConfirm(pendingClaims.map((s) => s.id))}
                >
                  تأیید گروهی (مدیر مالی · چهارچشم)
                </button>
              ) : null}
            </SelectionActionBar>
          ) : null}
          <DataList>
            {pendingClaims.map((s) => (
              <div
                key={s.id}
                className={!readOnly ? selStyles.selectableRow : undefined}
                {...(!readOnly
                  ? rowSelectActivateProps({
                      onActivate: () => claimSelection.toggle(s.id),
                    })
                  : {})}
              >
                <DataRow
                  title={
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {!readOnly ? (
                        <RowSelectCheckbox
                          checked={claimSelection.isSelected(s.id)}
                          onChange={() => claimSelection.toggle(s.id)}
                          label={`انتخاب ${memberLabel(s.fromUserId)} به ${memberLabel(s.toUserId)}`}
                        />
                      ) : null}
                      {`${memberLabel(s.fromUserId)} → ${memberLabel(s.toUserId)}`}
                    </span>
                  }
                  meta={
                    currentUserId && s.toUserId === currentUserId
                      ? "طلب شما"
                      : undefined
                  }
                  trailing={<Amount irrMinor={s.amount.amountMinor} />}
                />
              </div>
            ))}
          </DataList>
        </>
      ) : null}
    </>
  );
}
