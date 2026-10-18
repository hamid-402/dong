"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  WorkspaceWebhookDeliverySummary,
  WorkspaceWebhookSummary,
} from "@dang/contracts";
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
import { useOptionalAppChrome } from "@/lib/use-app-chrome";

/** User-facing names for webhook event keys (keys stay in the payload). */
const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  "expense.posted": "ثبت هزینه",
  "settlement.confirmed": "تأیید تسویه",
};

function webhookEventLabel(event: string): string {
  return WEBHOOK_EVENT_LABELS[event] ?? "رویداد دیگر";
}

/** Outbound webhooks — only interactive when capabilities.outboundWebhooks=hmac_v1. */
export function WorkspaceWebhooksPanel({
  workspaceId,
  readOnly = false,
}: {
  workspaceId: string;
  readOnly?: boolean;
}) {
  const chrome = useOptionalAppChrome();
  const live = chrome?.capabilities?.providers?.outboundWebhooks === "hmac_v1";
  const [rows, setRows] = useState<WorkspaceWebhookSummary[]>([]);
  const [deliveries, setDeliveries] = useState<WorkspaceWebhookDeliverySummary[]>(
    [],
  );
  const [url, setUrl] = useState("https://example.com/dang-hook");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => {
      void Promise.all([
        api.listWebhooks(workspaceId).catch((err: unknown) => {
          setError(friendlyErrorMessage(err, "بارگذاری وب‌هوک"));
          return [] as WorkspaceWebhookSummary[];
        }),
        api.listWebhookDeliveries(workspaceId).catch(() => {
          /* Deliveries may 500 when migration is pending — calm empty state. */
          return [] as WorkspaceWebhookDeliverySummary[];
        }),
      ]).then(([hooks, logs]) => {
        setRows(hooks);
        setDeliveries(logs);
      });
    });
  }

  useEffect(() => {
    if (!live || !workspaceId) return;
    refresh();
  }, [workspaceId, live]);

  if (!live) {
    return (
      <SectionCard title="وب‌هوک خروجی">
        <EmptyHint>
          ارسال خودکار رویدادها به نشانی بیرونی در این محیط فعال نیست.
        </EmptyHint>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="وب‌هوک خروجی" badge={rows.length}>
      <StatusLine>
        رویدادهای ارسالی: ثبت هزینه · تأیید تسویه. هر ارسال با امضای رمزنگاری‌شده همراه است تا گیرنده اصالت آن را بسنجد.
      </StatusLine>
      {error ? <StatusLine>{error}</StatusLine> : null}
      {info ? <StatusLine>{info}</StatusLine> : null}
      {!readOnly ? (
        <FormStack density="compact">
          <TextField label="نشانی گیرنده" value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextField
            label="کلید امضا (حداقل ۱۶ کاراکتر)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                void api
                  .createWebhook(workspaceId, {
                    workspaceId,
                    url,
                    events: ["expense.posted", "settlement.confirmed"],
                    secret,
                    idempotencyKey: newClientId(),
                  })
                  .then(() => {
                    setSecret("");
                    setInfo("وب‌هوک ثبت شد");
                    setError(null);
                    refresh();
                  })
                  .catch((err: unknown) =>
                    setError(friendlyErrorMessage(err, "ثبت وب‌هوک ناموفق")),
                  );
              });
            }}
          >
            ثبت وب‌هوک
          </Button>
        </FormStack>
      ) : (
        <EmptyHint>نقش فقط مشاهده — ثبت وب‌هوک غیرفعال است.</EmptyHint>
      )}
      {rows.length === 0 ? (
        <EmptyHint>وب‌هوکی ثبت نشده.</EmptyHint>
      ) : (
        <DataList>
          {rows.map((row) => (
            <DataRow
              key={row.id}
              title={row.url}
              meta={row.events.map(webhookEventLabel).join("، ")}
              trailing={
                <StatusPill tone={row.active ? "ok" : "neutral"}>
                  {row.active ? "فعال" : "غیرفعال"}
                </StatusPill>
              }
              actions={
                !readOnly && row.active ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      startTransition(() => {
                        void api
                          .deactivateWebhook(workspaceId, row.id)
                          .then(() => refresh())
                          .catch((err: unknown) =>
                            setError(friendlyErrorMessage(err, "غیرفعال‌سازی ناموفق")),
                          );
                      });
                    }}
                  >
                    غیرفعال
                  </Button>
                ) : null
              }
            />
          ))}
        </DataList>
      )}
      <StatusLine>ارسال‌های اخیر</StatusLine>
      {deliveries.length === 0 ? (
        <EmptyHint>هنوز ارسالی ثبت نشده</EmptyHint>
      ) : (
        <DataList>
          {deliveries.map((d) => (
            <DataRow
              key={d.id}
              title={webhookEventLabel(d.eventType)}
              meta={`${d.detail}${d.statusCode != null ? ` · کد پاسخ ${d.statusCode.toLocaleString("fa-IR")}` : ""}`}
              trailing={
                <StatusPill tone={d.ok ? "ok" : "warn"}>
                  {d.ok ? "موفق" : "ناموفق"}
                </StatusPill>
              }
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
