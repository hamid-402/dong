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
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  approvalQueueKindLabel,
  approvalQueueStatusLabel,
  membershipRoleLabel,
} from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { t } from "@/lib/i18n";
import { formatFaDate, formatFaDateTime } from "@/lib/fa-datetime";
import { wPath, type WorkspacePage } from "@/lib/workspace-paths";
import { ConfirmSettlementDialog } from "@/components/views/finance/confirm-settlement-dialog";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";
import { NAV_LABELS } from "@/lib/nav-labels";
import styles from "./approvals.module.css";

export default function WorkspaceApprovalsPage() {
  return (
    <WorkspacePageGate page="approvals">
      <WorkspaceApprovalsPageInner />
    </WorkspacePageGate>
  );
}

function WorkspaceApprovalsPageInner() {
  const chrome = useAppChrome();
  const enabled = Boolean(chrome.capabilities?.productFlags?.approvalQueue);
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [myRole, setMyRole] = useState<string>("");
  const [actorUserId, setActorUserId] = useState<string>("");
  const [selectedKey, setSelectedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const [confirmSettlementId, setConfirmSettlementId] = useState<string | null>(null);
  const evidenceRequired = Boolean(
    chrome.capabilities?.productFlags?.settlementEvidence,
  );
  const workspace = chrome.workspaces.find((row) => row.id === chrome.workspaceId);
  const readOnly = isReadOnlyRole(myRole);
  const selectedItem =
    items.find((item) => `${item.kind}:${item.id}` === selectedKey) ??
    items[0] ??
    null;

  function refresh() {
    if (!chrome.workspaceId || !enabled) {
      setItems([]);
      setMyRole("");
      setLoaded(true);
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
      setLoaded(true);
    });
  }

  useEffect(() => {
    setLoaded(false);
    void refresh().catch((reason: unknown) => {
      setError(friendlyErrorMessage(reason, "بارگذاری مرکز تأیید ناموفق"));
      setLoaded(true);
    });
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
    if (item.kind === "settlement") {
      return (
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmSettlementId(item.id)}
          >
            تأیید تسویه
          </Button>
          {workspace ? (
            <Link href={wPath(workspace.slug, "settlements")}>جزئیات</Link>
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
      <WorkspacePageFrame
        title={NAV_LABELS.approvals}
        description="صف اقدام‌های واقعی در انتظار تأیید — بدون badge جعلی."
        primaryAction={
          workspace ? (
            <Link href={wPath(workspace.slug, "expenses")}>{NAV_LABELS.expenses}</Link>
          ) : (
            <Link href="/spaces">{NAV_LABELS.spacesList}</Link>
          )
        }
        state={!enabled ? "empty" : !loaded && enabled ? "loading" : "ready"}
        loadingLabel="در حال بارگذاری مرکز تأیید…"
        empty={<EmptyHint>قابلیت مرکز تأیید در این محیط فعال نیست.</EmptyHint>}
      >
      {error ? <StatusLine>{error}</StatusLine> : null}
      {enabled && chrome.capabilities ? (
        <StatusLine>
          {(() => {
            const mode = chrome.capabilities.providers?.makerChecker;
            const sla = chrome.capabilities.providers?.makerCheckerSla;
            const maker =
              !mode || mode === "off"
                ? t("approvals.makerOff")
                : mode === "four_eyes"
                  ? t("approvals.makerFourEyes")
                  : mode === "four_eyes_queue_v1"
                    ? t("approvals.makerQueue")
                    : mode;
            const slaNote =
              sla === "hours_v1"
                ? ` · ${t("approvals.slaHours")}`
                : "";
            return `${maker}${slaNote}`;
          })()}
        </StatusLine>
      ) : null}
      {!enabled ? (
        <EmptyHint>قابلیت مرکز تأیید در این محیط فعال نیست.</EmptyHint>
      ) : !chrome.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : !loaded ? (
        <ContentSkeleton rows={3} label="در حال بارگذاری مرکز تأیید…" />
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
            <div className={styles.masterDetail}>
              <DataList>
                {items.map((item) => (
                  <div
                    key={`${item.kind}:${item.id}:${item.status}`}
                    className={
                      selectedItem?.id === item.id && selectedItem.kind === item.kind
                        ? styles.selectedRow
                        : undefined
                    }
                  >
                    <DataRow
                      title={item.title}
                      meta={
                        <>
                          <StatusPill tone="neutral">{approvalQueueKindLabel(item.kind)}</StatusPill>
                          <StatusPill tone="warn">
                            {approvalQueueStatusLabel(item.status)}
                          </StatusPill>
                          {typeof item.approvalsNeeded === "number" &&
                          item.approvalsNeeded > 0 ? (
                            <StatusPill tone="neutral">
                              {t("approvals.tierProgress", {
                                have: String(item.approvalsHave ?? 0),
                                need: String(item.approvalsNeeded),
                              })}
                            </StatusPill>
                          ) : null}
                          {item.slaBreached ? (
                            <StatusPill tone="danger">{t("approvals.slaBreached")}</StatusPill>
                          ) : item.slaDueAt ? (
                            <StatusPill tone="neutral">
                              {t("approvals.slaDue")}: {formatFaDateTime(item.slaDueAt)}
                            </StatusPill>
                          ) : null}
                        </>
                      }
                      trailing={
                        item.amount ? <Amount irrMinor={item.amount.amountMinor} /> : null
                      }
                      actions={
                        <Button
                          type="button"
                          variant="ghost"
                          aria-pressed={selectedItem?.id === item.id && selectedItem.kind === item.kind}
                          onClick={() => setSelectedKey(`${item.kind}:${item.id}`)}
                        >
                          جزئیات
                        </Button>
                      }
                    />
                  </div>
                ))}
              </DataList>
              {selectedItem ? (
                <aside className={styles.inspector} aria-label={`جزئیات ${selectedItem.title}`}>
                  <span>بازرس تصمیم</span>
                  <h3>{selectedItem.title}</h3>
                  {selectedItem.amount ? <Amount irrMinor={selectedItem.amount.amountMinor} /> : null}
                  <dl>
                    <div><dt>نوع</dt><dd>{approvalQueueKindLabel(selectedItem.kind)}</dd></div>
                    <div><dt>وضعیت</dt><dd>{approvalQueueStatusLabel(selectedItem.status)}</dd></div>
                    <div><dt>زمان ایجاد</dt><dd><time dateTime={selectedItem.createdAt}>{formatFaDate(selectedItem.createdAt)}</time></dd></div>
                    {typeof selectedItem.approvalsNeeded === "number" &&
                    selectedItem.approvalsNeeded > 0 ? (
                      <div>
                        <dt>{t("approvals.tierLabel")}</dt>
                        <dd>
                          {t("approvals.tierProgress", {
                            have: String(selectedItem.approvalsHave ?? 0),
                            need: String(selectedItem.approvalsNeeded),
                          })}
                        </dd>
                      </div>
                    ) : null}
                    {selectedItem.slaDueAt ? (
                      <div>
                        <dt>{t("approvals.slaDue")}</dt>
                        <dd>
                          <time dateTime={selectedItem.slaDueAt}>
                            {formatFaDateTime(selectedItem.slaDueAt)}
                          </time>
                          {selectedItem.slaBreached ? ` · ${t("approvals.slaBreached")}` : ""}
                        </dd>
                      </div>
                    ) : null}
                    <div><dt>سطح دسترسی</dt><dd>{readOnly ? "فقط مشاهده" : "اقدام مجاز"}</dd></div>
                  </dl>
                  <div className={styles.inspectorActions}>{actionsFor(selectedItem)}</div>
                </aside>
              ) : null}
            </div>
          )}
        </SectionCard>
      )}
      </WorkspacePageFrame>
      {confirmSettlementId && chrome.workspaceId ? (
        <ConfirmSettlementDialog
          pending={pending}
          evidenceRequired={evidenceRequired}
          onCancel={() => setConfirmSettlementId(null)}
          onConfirm={(evidence) => {
            const id = confirmSettlementId;
            setConfirmSettlementId(null);
            run(
              () => api.confirmSettlement(chrome.workspaceId, id, evidence),
              "تأیید تسویه ناموفق",
            );
          }}
        />
      ) : null}
    </AppShell>
  );
}
