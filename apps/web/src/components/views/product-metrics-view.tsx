"use client";

import { useEffect, useState } from "react";
import type { WorkspaceProductMetricsResponse } from "@dang/contracts";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  EmptyStateBlock,
  PageHeader,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      setMetrics(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await api.workspaceProductMetrics(workspaceId);
        if (!cancelled) {
          setMetrics(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setMetrics(null);
          setError(friendlyErrorMessage(err, "خواندن متریک ممکن نشد"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <AppShell
      workspaceId={workspaceId}
      workspaceName={chrome.workspaceName}
      userName={chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="فضا"
        title="متریک محصول"
        description="شمارش از رویدادهای audit واقعی همین فضا — بدون نرخ ساختگی."
      />

      {!workspaceId ? (
        <EmptyStateBlock
          title="فضایی انتخاب نشده"
          description="از فهرست فضاها یک فضا باز کنید تا متریک همان فضا از audit خوانده شود."
        />
      ) : null}

      {loading ? <EmptyHint loading>در حال خواندن audit…</EmptyHint> : null}
      {error ? (
        <EmptyStateBlock title="خواندن متریک ممکن نشد" description={error} />
      ) : null}

      {metrics && !loading ? (
        <>
          <StatusLine>
            منبع: audit ({metrics.auditPersistence === "postgres" ? "Postgres" : "حافظه"}) ·{" "}
            {metrics.eventCount} رویداد قابل‌خواندن
          </StatusLine>

          {metrics.eventCount === 0 ? (
            <EmptyStateBlock
              title="هنوز رویدادی در audit نیست"
              description="بعد از ساخت فضا، ثبت خرج و تأیید تسویه، شمارش‌ها از همان رویدادها پر می‌شوند."
            />
          ) : (
            <SectionCard title="قیف فضا (شمارش واقعی)">
              <ul className="spaces-list">
                {(
                  [
                    ["ساخت فضا", metrics.milestones.onboardingWorkspaceCreated, metrics.counts.workspaceCreates],
                    ["پذیرش دعوت", metrics.milestones.inviteAccepted, metrics.counts.inviteAccepts],
                    ["خرج ثبت‌شده روی مانده", metrics.milestones.firstExpensePosted, metrics.counts.expensePosts],
                    ["تسویه تأییدشده", metrics.milestones.settlementCompleted, metrics.counts.settlementConfirms],
                  ] as const
                ).map(([label, milestone, count]) => (
                  <li key={milestone.sourceAction}>
                    <div className="spaces-list__item">
                      <b>
                        {label}{" "}
                        <StatusPill tone={milestone.reached ? "ok" : "neutral"}>
                          {milestone.reached ? "رسیده" : "نرسیده"}
                        </StatusPill>
                      </b>
                      <small>
                        تعداد موفق: {count.toLocaleString("fa-IR")} · action:{" "}
                        <code>{milestone.sourceAction}</code>
                        {milestone.firstAt
                          ? ` · اولین بار: ${formatWhen(milestone.firstAt)}`
                          : ""}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
