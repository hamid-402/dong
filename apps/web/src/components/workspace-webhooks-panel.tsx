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
        api.listWebhooks(workspaceId),
        api.listWebhookDeliveries(workspaceId),
      ])
        .then(([hooks, logs]) => {
          setRows(hooks);
          setDeliveries(logs);
        })
        .catch((err: unknown) =>
          setError(friendlyErrorMessage(err, "بارگذاری وب‌هوک")),
        );
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
          قابلیت outboundWebhooks در capabilities خاموش است — بدون HMAC ادعا نمی‌شود.
        </EmptyHint>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="وب‌هوک خروجی (HMAC)" badge={rows.length}>
      <StatusLine>
        رویدادها: expense.posted · settlement.confirmed — امضا با هدر x-dang-signature
      </StatusLine>
      {error ? <StatusLine>{error}</StatusLine> : null}
      {info ? <StatusLine>{info}</StatusLine> : null}
      {!readOnly ? (
        <FormStack density="compact">
          <TextField label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextField
            label="Secret (حداقل ۱۶ کاراکتر)"
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
              meta={row.events.join(", ")}
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
      <StatusLine>لاگ تحویل اخیر (واقعی از dispatch)</StatusLine>
      {deliveries.length === 0 ? (
        <EmptyHint>هنوز تحویلی ثبت نشده — پس از expense.posted / settlement.confirmed ظاهر می‌شود.</EmptyHint>
      ) : (
        <DataList>
          {deliveries.map((d) => (
            <DataRow
              key={d.id}
              title={d.eventType}
              meta={`${d.detail}${d.statusCode != null ? ` · HTTP ${d.statusCode}` : ""} · ${d.webhookId.slice(0, 8)}…`}
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
