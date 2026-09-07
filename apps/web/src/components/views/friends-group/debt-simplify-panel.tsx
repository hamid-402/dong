"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  DebtSimplifySuggestionsResponse,
} from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { DataList, DataRow } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";

type Props = {
  workspaceId: string;
  memberLabel: (userId: string) => string;
  enabled: boolean;
  /** Auditor/guest — suggestions without Apply. */
  readOnly?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onApplied?: () => void;
};

/** First-class simplify UI — only rendered when productFlags.debtSimplifyApi is on. */
export function DebtSimplifyPanel({
  workspaceId,
  memberLabel,
  enabled,
  readOnly = false,
  onError,
  onSuccess,
  onApplied,
}: Props) {
  const [payload, setPayload] = useState<DebtSimplifySuggestionsResponse | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) {
      setPayload(null);
      return;
    }
    void api
      .getDebtSimplifySuggestions(workspaceId)
      .then(setPayload)
      .catch((err: unknown) =>
        onError(friendlyErrorMessage(err, "بارگذاری پیشنهاد تسویه ناموفق")),
      );
  }, [enabled, workspaceId, onError]);

  // When API flag is off, do not show a dead suggestion list without Apply.
  if (!enabled) {
    return null;
  }

  const suggestions = payload?.suggestions ?? [];
  if (suggestions.length === 0) {
    return null;
  }

  function onApplyAll() {
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
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "ثبت ادعای ساده‌سازی ناموفق"));
        }
      })();
    });
  }

  return (
    <>
      <p className="liveHint">
        پیشنهاد تسویه حداقلی — عضو بدهکار به طلبکار
        {payload
          ? payload.goldenRulesOk
            ? " · قوانین طلایی تأیید شد"
            : " · هشدار: قوانین طلایی برقرار نیست"
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
      <div className="dataRowActions">
        {readOnly ? (
          <p className="liveHint">نقش شما فقط مشاهده دارد — ثبت ادعا فعال نیست.</p>
        ) : (
          <Button type="button" onClick={onApplyAll} disabled={pending}>
            ثبت همه به‌عنوان ادعای تسویه
          </Button>
        )}
      </div>
    </>
  );
}
