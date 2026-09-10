"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipRole, MembershipSummary, WorkspaceProductMetricsResponse } from "@dang/contracts";
import {
  EmptyHint,
  EmptyStateBlock,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { membershipRoleLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { wPath } from "@/lib/workspace-paths";
import styles from "./product-metrics-view.module.css";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ProductMetricsView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const [metrics, setMetrics] = useState<WorkspaceProductMetricsResponse | null>(null);
  const [myRole, setMyRole] = useState<MembershipRole | "">("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    if (!workspaceId) {
      setMetrics(null);
      setMyRole("");
      return;
    }
    startTransition(() => {
      void Promise.all([
        api.workspaceProductMetrics(workspaceId),
        api.listMembers(workspaceId).catch(() => [] as MembershipSummary[]),
      ])
        .then(([data, members]) => {
          setMetrics(data);
          setMyRole(
            members.find((member) => member.userId === chrome.actor?.userId)?.role ?? "",
          );
          setError(null);
          setSelectedKey((current) => current ?? "workspace");
        })
        .catch((err: unknown) => {
          setMetrics(null);
          setError(friendlyErrorMessage(err, "خواندن متریک ممکن نشد"));
        });
    });
  }

  useEffect(() => {
    refresh();
  }, [workspaceId, chrome.actor?.userId]);

  const rows = metrics
    ? ([
        {
          key: "workspace",
          label: "ساخت فضا",
          milestone: metrics.milestones.onboardingWorkspaceCreated,
          count: metrics.counts.workspaceCreates,
        },
        {
          key: "invite",
          label: "پذیرش دعوت",
          milestone: metrics.milestones.inviteAccepted,
          count: metrics.counts.inviteAccepts,
        },
        {
          key: "expense",
          label: "خرج ثبت‌شده روی مانده",
          milestone: metrics.milestones.firstExpensePosted,
          count: metrics.counts.expensePosts,
        },
        {
          key: "settlement",
          label: "تسویه تأییدشده",
          milestone: metrics.milestones.settlementCompleted,
          count: metrics.counts.settlementConfirms,
        },
      ] as const)
    : [];
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const reachedCount = rows.filter((row) => row.milestone.reached).length;

  return (
    <div>
      <OperationsModuleHeader
        ariaLabel="متریک محصول فضای کاری"
        destinations={[
          { key: "metrics", label: "متریک محصول", href: wPath(scope.slug, "metrics"), active: true },
          { key: "audit", label: "تاریخچه", href: wPath(scope.slug, "audit"), active: false },
          { key: "settings", label: "تنظیمات", href: wPath(scope.slug, "settings"), active: false },
          { key: "members", label: "اعضا", href: wPath(scope.slug, "members"), active: false },
        ]}
        metrics={[
          {
            label: "رویداد قابل‌خواندن",
            value: metrics
              ? new Intl.NumberFormat("fa-IR").format(metrics.eventCount)
              : pending
                ? "…"
                : "—",
            detail: metrics
              ? `audit · ${metrics.auditPersistence === "postgres" ? "Postgres" : "حافظه"}`
              : "از audit همین فضا",
          },
          {
            label: "مایلستون رسیده",
            value: metrics ? new Intl.NumberFormat("fa-IR").format(reachedCount) : "—",
            detail: "از ۴ نقطه قیف واقعی",
            tone: reachedCount > 0 ? "positive" : "neutral",
          },
          {
            label: "خرج posted",
            value: metrics
              ? new Intl.NumberFormat("fa-IR").format(metrics.counts.expensePosts)
              : "—",
            detail: "action: expense.post",
          },
          {
            label: "تسویه تأییدشده",
            value: metrics
              ? new Intl.NumberFormat("fa-IR").format(metrics.counts.settlementConfirms)
              : "—",
            detail: "action: settlement.claim.confirm",
            tone: metrics && metrics.counts.settlementConfirms > 0 ? "positive" : "neutral",
          },
        ]}
        roleLabel={myRole ? membershipRoleLabel(myRole) : null}
        persistenceLabel={chrome.persistenceLabel}
        pending={pending}
        onRefresh={refresh}
      />

      {!workspaceId ? (
        <EmptyStateBlock
          title="فضایی انتخاب نشده"
          description="از فهرست فضاها یک فضا باز کنید تا متریک همان فضا از audit خوانده شود."
        />
      ) : null}

      {pending && !metrics ? <EmptyHint loading>در حال خواندن audit…</EmptyHint> : null}
      {error ? (
        <EmptyStateBlock title="خواندن متریک ممکن نشد" description={error} />
      ) : null}

      {metrics && !error ? (
        <>
          <StatusLine>
            منبع: audit ({metrics.auditPersistence === "postgres" ? "Postgres" : "حافظه"}) ·{" "}
            {new Intl.NumberFormat("fa-IR").format(metrics.eventCount)} رویداد قابل‌خواندن
          </StatusLine>

          {metrics.eventCount === 0 ? (
            <EmptyStateBlock
              title="هنوز رویدادی در audit نیست"
              description="بعد از ساخت فضا، ثبت خرج و تأیید تسویه، شمارش‌ها از همان رویدادها پر می‌شوند."
            />
          ) : (
            <SectionCard title="قیف فضا (شمارش واقعی)">
              <div className={styles.masterDetail}>
                <ul className={styles.funnelList}>
                  {rows.map((row) => (
                    <li key={row.key} className={row.key === selectedKey ? styles.selected : undefined}>
                      <button type="button" onClick={() => setSelectedKey(row.key)}>
                        <span>
                          <b>{row.label}</b>
                          <small>
                            تعداد موفق: {row.count.toLocaleString("fa-IR")} ·{" "}
                            <code>{row.milestone.sourceAction}</code>
                          </small>
                        </span>
                        <StatusPill tone={row.milestone.reached ? "ok" : "neutral"}>
                          {row.milestone.reached ? "رسیده" : "نرسیده"}
                        </StatusPill>
                      </button>
                    </li>
                  ))}
                </ul>

                <aside className={styles.inspector} aria-label="جزئیات مایلستون انتخاب‌شده">
                  {selected ? (
                    <>
                      <span>مایلستون انتخاب‌شده</span>
                      <h3>{selected.label}</h3>
                      <StatusPill tone={selected.milestone.reached ? "ok" : "neutral"}>
                        {selected.milestone.reached ? "رسیده" : "نرسیده"}
                      </StatusPill>
                      <dl>
                        <div>
                          <dt>تعداد موفق</dt>
                          <dd>{selected.count.toLocaleString("fa-IR")}</dd>
                        </div>
                        <div>
                          <dt>action منبع</dt>
                          <dd>
                            <code>{selected.milestone.sourceAction}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>اولین وقوع</dt>
                          <dd>{formatWhen(selected.milestone.firstAt)}</dd>
                        </div>
                        <div>
                          <dt>پایداری audit</dt>
                          <dd>
                            {metrics.auditPersistence === "postgres" ? "Postgres" : "حافظه"}
                          </dd>
                        </div>
                      </dl>
                      <p>
                        این عدد فقط از رویدادهای موفقیت‌آمیز audit محاسبه شده و نرخ یا درصد ساختگی
                        ندارد.
                      </p>
                    </>
                  ) : (
                    <EmptyHint>یک مایلستون را برای جزئیات انتخاب کنید.</EmptyHint>
                  )}
                </aside>
              </div>
            </SectionCard>
          )}
        </>
      ) : null}
    </div>
  );
}
