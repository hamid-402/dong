"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { ApprovalQueueItem } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";

export default function WorkspaceApprovalsPage() {
  const chrome = useAppChrome();
  const enabled = Boolean(chrome.capabilities?.productFlags?.approvalQueue);
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const workspace = chrome.workspaces.find((row) => row.id === chrome.workspaceId);

  function refresh() {
    if (!chrome.workspaceId || !enabled) {
      setItems([]);
      return Promise.resolve();
    }
    return api.listApprovalQueue(chrome.workspaceId).then(setItems);
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(friendlyErrorMessage(reason, "بارگذاری مرکز تأیید ناموفق")),
    );
  }, [chrome.workspaceId, enabled]);

  function approveExpense(expenseId: string) {
    if (!chrome.workspaceId) return;
    startTransition(() => {
      void api
        .approveExpense(chrome.workspaceId, expenseId)
        .then(() => refresh())
        .catch((reason: unknown) =>
          setError(friendlyErrorMessage(reason, "تأیید خرج ناموفق")),
        );
    });
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="فضای کاری"
        title="مرکز تأیید"
        description="فقط موارد واقعی در انتظار اقدام از خرج‌ها، صورتحساب‌ها و اضافه‌های شخصی."
      />
      {error ? <p className="liveError">{error}</p> : null}
      {!enabled ? (
        <EmptyHint>قابلیت مرکز تأیید در این محیط فعال نیست.</EmptyHint>
      ) : !chrome.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : (
        <SectionCard title="در انتظار اقدام" badge={items.length}>
          {items.length === 0 ? (
            <EmptyHint>موردی برای تأیید وجود ندارد.</EmptyHint>
          ) : (
            <DataList>
              {items.map((item) => (
                <DataRow
                  key={`${item.kind}:${item.id}`}
                  title={item.title}
                  meta={<StatusPill tone="warn">{item.status}</StatusPill>}
                  trailing={
                    item.amount ? <Amount irrMinor={item.amount.amountMinor} /> : null
                  }
                  actions={
                    item.kind === "expense" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => approveExpense(item.id)}
                      >
                        تأیید خرج
                      </Button>
                    ) : workspace ? (
                      <Link
                        href={wPath(
                          workspace.slug,
                          item.hrefHint as WorkspacePage,
                        )}
                      >
                        مشاهده
                      </Link>
                    ) : null
                  }
                />
              ))}
            </DataList>
          )}
        </SectionCard>
      )}
    </AppShell>
  );
}
