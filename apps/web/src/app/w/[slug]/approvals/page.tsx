"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { ApprovalQueueItem, MembershipSummary } from "@dang/contracts";
import { isReadOnlyRole } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  PageHeader,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  approvalQueueKindLabel,
  approvalQueueStatusLabel,
  membershipRoleLabel,
} from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";

export default function WorkspaceApprovalsPage() {
  const chrome = useAppChrome();
  const enabled = Boolean(chrome.capabilities?.productFlags?.approvalQueue);
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [myRole, setMyRole] = useState<string>("");
  const [actorUserId, setActorUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const workspace = chrome.workspaces.find((row) => row.id === chrome.workspaceId);
  const readOnly = isReadOnlyRole(myRole);

  function refresh() {
    if (!chrome.workspaceId || !enabled) {
      setItems([]);
      setMyRole("");
      return Promise.resolve();
    }
    return Promise.all([
      api.listApprovalQueue(chrome.workspaceId),
      api.listMembers(chrome.workspaceId),
      api.me(),
    ]).then(([queue, members, me]) => {
      setItems(queue);
      setActorUserId(me.actor.userId);
      setMyRole(
        members.find((m: MembershipSummary) => m.userId === me.actor.userId)?.role ??
          "",
      );
    });
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(friendlyErrorMessage(reason, "بارگذاری مرکز تأیید ناموفق")),
    );
  }, [chrome.workspaceId, enabled, chrome.actor?.userId]);

  function run(action: () => Promise<unknown>, fail: string) {
    if (!chrome.workspaceId || readOnly) return;
    startTransition(() => {
      void action()
        .then(() => refresh())
        .catch((reason: unknown) => setError(friendlyErrorMessage(reason, fail)));
    });
  }

  function actionsFor(item: ApprovalQueueItem) {
    if (readOnly || !chrome.workspaceId) {
      return workspace ? (
        <Link href={wPath(workspace.slug, item.hrefHint as WorkspacePage)}>مشاهده</Link>
      ) : null;
    }
    if (item.kind === "expense") {
      return (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(
              () => api.approveExpense(chrome.workspaceId, item.id),
              "تأیید خرج ناموفق",
            )
          }
        >
          تأیید خرج
        </Button>
      );
    }
    if (item.kind === "member_invoice") {
      return (
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => api.approveInvoice(chrome.workspaceId, item.id),
                "تأیید صورتحساب ناموفق",
              )
            }
          >
            تأیید
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  api.disputeInvoice(chrome.workspaceId, item.id, "اعتراض از مرکز تأیید"),
                "اعتراض صورتحساب ناموفق",
              )
            }
          >
            اعتراض
          </Button>
        </>
      );
    }
    if (item.kind === "addon_charge") {
      // Target confirms; creator can only wait — still allow confirm if actor is target.
      return (
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => api.confirmAddonCharge(chrome.workspaceId, item.id),
                "تأیید اضافه ناموفق",
              )
            }
          >
            تأیید اضافه
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  api.disputeAddonCharge(chrome.workspaceId, item.id, {
                    note: "اعتراض از مرکز تأیید",
                  }),
                "اعتراض اضافه ناموفق",
              )
            }
          >
            اعتراض
          </Button>
          {workspace ? (
            <Link href={wPath(workspace.slug, "addons")}>جزئیات</Link>
          ) : null}
        </>
      );
    }
    return null;
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
        description="صندوق اقدام واقعی از خرج‌ها، صورتحساب‌ها و اضافه‌های شخصی — فقط دادهٔ API."
      />
      {error ? <p className="liveError">{error}</p> : null}
      {!enabled ? (
        <EmptyHint>قابلیت مرکز تأیید در این محیط فعال نیست.</EmptyHint>
      ) : !chrome.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : (
        <SectionCard title="در انتظار اقدام" badge={items.length}>
          {readOnly ? (
            <StatusLine>
              نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — تأیید از این صفحه فعال نیست.
            </StatusLine>
          ) : actorUserId ? (
            <StatusLine>اقدام‌ها روی موارد واقعی صف — بدون badge جعلی.</StatusLine>
          ) : null}
          {items.length === 0 ? (
            <EmptyHint>موردی برای تأیید وجود ندارد.</EmptyHint>
          ) : (
            <DataList>
              {items.map((item) => (
                <DataRow
                  key={`${item.kind}:${item.id}:${item.status}`}
                  title={item.title}
                  meta={
                    <>
                      <StatusPill tone="neutral">{approvalQueueKindLabel(item.kind)}</StatusPill>
                      <StatusPill tone="warn">
                        {approvalQueueStatusLabel(item.status)}
                      </StatusPill>
                    </>
                  }
                  trailing={
                    item.amount ? <Amount irrMinor={item.amount.amountMinor} /> : null
                  }
                  actions={actionsFor(item)}
                />
              ))}
            </DataList>
          )}
        </SectionCard>
      )}
    </AppShell>
  );
}
