"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  DebtSimplifySuggestionsResponse,
  SettlementSummary,
} from "@dang/contracts";
import {
  isDebtSimplifyClaimNote,
  previewBalancesAfterTransfers,
} from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { DataList, DataRow, StatusLine } from "@/components/ui-blocks";
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
}: Props) {
  const [payload, setPayload] = useState<DebtSimplifySuggestionsResponse | null>(
    null,
  );
  const [pendingClaims, setPendingClaims] = useState<SettlementSummary[]>([]);
  const [pending, startTransition] = useTransition();

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
            پیشنهاد تسویه حداقلی — عضو بدهکار به طلبکار
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
            {suggestions.map((s) => (
              <DataRow
                key={`${s.fromUserId}-${s.toUserId}-${s.amount.amountMinor}`}
                title={`${memberLabel(s.fromUserId)} می‌دهد به ${memberLabel(s.toUserId)}`}
                trailing={<Amount irrMinor={s.amount.amountMinor} />}
              />
            ))}
          </DataList>
          {projected.length > 0 ? (
            <StatusLine>
              پیش‌نمایش مانده پس از تأیید همه:{" "}
              {projected.map((line, index) => (
                <span key={line.userId}>
                  {index > 0 ? " · " : null}
                  {memberLabel(line.userId)}{" "}
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
          <DataList>
            {pendingClaims.map((s) => (
              <DataRow
                key={s.id}
                title={`${memberLabel(s.fromUserId)} → ${memberLabel(s.toUserId)}`}
                meta={
                  currentUserId && s.toUserId === currentUserId
                    ? "طلب شما"
                    : undefined
                }
                trailing={<Amount irrMinor={s.amount.amountMinor} />}
              />
            ))}
          </DataList>
          {!readOnly ? (
            <div className="dataRowActions">
              {myReceivables.length > 0 ? (
                <Button
                  type="button"
                  onClick={() => onConfirm(myReceivables.map((s) => s.id))}
                  disabled={pending}
                >
                  ۲) تأیید طلب‌های من ({myReceivables.length})
                </Button>
              ) : null}
              {canApplyClaims && pendingClaims.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onConfirm(pendingClaims.map((s) => s.id))}
                  disabled={pending}
                >
                  تأیید گروهی (مدیر مالی · چهارچشم)
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
