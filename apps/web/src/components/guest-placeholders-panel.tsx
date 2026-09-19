"use client";

import { useEffect, useState, useTransition } from "react";
import type { GuestPlaceholderSummary } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";

/**
 * Create/list guest placeholders + share claim link (G04 product surface).
 */
export function GuestPlaceholdersPanel({
  workspaceId,
  readOnly = false,
  onError,
  onSuccess,
}: {
  workspaceId: string;
  readOnly?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [rows, setRows] = useState<GuestPlaceholderSummary[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lastClaimPath, setLastClaimPath] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    return api
      .listGuestPlaceholders(workspaceId)
      .then(setRows)
      .catch((err: unknown) =>
        onError(friendlyErrorMessage(err, "بارگذاری مهمان‌ها ناموفق")),
      );
  }

  useEffect(() => {
    void reload();
  }, [workspaceId]);

  function onCreate() {
    if (!name.trim()) {
      onError("نام مهمان لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createGuestPlaceholder(workspaceId, {
            displayName: name.trim(),
            phoneE164: phone.trim() || undefined,
            idempotencyKey: newClientId(),
          });
          setName("");
          setPhone("");
          if (created.claimPath) {
            setLastClaimPath(created.claimPath);
            const absolute =
              typeof window !== "undefined"
                ? `${window.location.origin}${created.claimPath}`
                : created.claimPath;
            try {
              await navigator.clipboard?.writeText(absolute);
              onSuccess("مهمان ثبت شد — لینک claim در کلیپبورد کپی شد");
            } catch {
              onSuccess(`مهمان ثبت شد — لینک: ${created.claimPath}`);
            }
          } else {
            onSuccess("مهمان ثبت شد");
          }
          await reload();
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "ثبت مهمان ناموفق"));
        }
      })();
    });
  }

  return (
    <SectionCard title="مهمان‌های بدون حساب" badge={rows.length} delayClass="delay2">
      <StatusLine>
        برای کسی که هنوز حساب ندارد جایگاه بسازید؛ با لینک claim، خرج‌ها و دفتر به حساب واقعی منتقل می‌شود.
      </StatusLine>
      {!readOnly ? (
        <FormStack>
          <TextField
            label="نام نمایشی مهمان"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="موبایل (اختیاری)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="button" disabled={pending || !name.trim()} onClick={onCreate}>
            ساخت جایگاه مهمان
          </Button>
        </FormStack>
      ) : null}
      {lastClaimPath ? (
        <p className="liveHint">
          آخرین لینک claim:{" "}
          <a href={lastClaimPath} target="_blank" rel="noreferrer">
            {lastClaimPath}
          </a>
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyHint>مهمانی ثبت نشده.</EmptyHint>
      ) : (
        <DataList>
          {rows.map((g) => (
            <DataRow
              key={g.id}
              title={g.displayName}
              meta={
                <>
                  <StatusPill tone={g.claimedUserId ? "ok" : "gold"}>
                    {g.claimedUserId ? "تصاحب‌شده" : "در انتظار claim"}
                  </StatusPill>
                  {g.phoneE164 ? ` · ${g.phoneE164}` : null}
                </>
              }
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
