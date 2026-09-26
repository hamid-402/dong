"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  AnalyticsWarehouseSnapshot,
  ChartSeriesResponse,
  MembershipRole,
  MembershipSummary,
  WorkspaceProductMetricsResponse,
} from "@dang/contracts";
import { Button } from "@dang/ui";
import {
  EmptyHint,
  EmptyStateBlock,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { api } from "@/lib/api";
import { workspaceAllowsAnalytics } from "@/lib/api/charts";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { wPath } from "@/lib/workspace-paths";
import { formatFaDateTime } from "@/lib/fa-datetime";
import styles from "./product-metrics-view.module.css";

function formatWhen(iso: string | null): string {
  return formatFaDateTime(iso);
}

function formatMinorIrr(minor: string): string {
  try {
    const toman = Number(BigInt(minor) / 10n);
    return new Intl.NumberFormat("fa-IR").format(toman);
  } catch {
    return minor;
  }
}

function warehouseModeLabel(mode: AnalyticsWarehouseSnapshot["mode"]): string {
  switch (mode) {
    case "postgres_replica_etl":
      return "Postgres replica + ETL";
    case "postgres_etl":
      return "Postgres schema analytics";
    case "memory_etl":
      return "حافظه (dev)";
    default:
      return mode;
  }
}

export function ProductMetricsView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const warehouseEnabled = Boolean(chrome.capabilities?.providers?.analyticsWarehouse);
  const chartsEnabled = chrome.capabilities?.providers?.charts === "charts_v1";
  const [metrics, setMetrics] = useState<WorkspaceProductMetricsResponse | null>(null);
  const [warehouse, setWarehouse] = useState<AnalyticsWarehouseSnapshot | null>(null);
  const [expenseTrend, setExpenseTrend] = useState<ChartSeriesResponse | null>(null);
  const [, setMyRole] = useState<MembershipRole | "">("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [analyticsPlanOk, setAnalyticsPlanOk] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [etlPending, startEtl] = useTransition();

  function refreshWarehouse() {
    if (!workspaceId || !warehouseEnabled) {
      setWarehouse(null);
      setWarehouseError(null);
      setAnalyticsPlanOk(null);
      return;
    }
    void (async () => {
      try {
        const allowed = await workspaceAllowsAnalytics(workspaceId);
        setAnalyticsPlanOk(allowed);
        if (!allowed) {
          setWarehouse(null);
          setWarehouseError(null);
          return;
        }
        const data = await api.analyticsWarehouse(workspaceId);
        setWarehouse(data);
        setWarehouseError(null);
      } catch (err: unknown) {
        setWarehouse(null);
        setWarehouseError(friendlyErrorMessage(err, "خواندن انبار تحلیلی ممکن نشد"));
      }
    })();
  }

  function runEtl() {
    if (!workspaceId || !warehouseEnabled) return;
    startEtl(() => {
      void (async () => {
        try {
          const allowed = await workspaceAllowsAnalytics(workspaceId);
          if (!allowed) {
            setWarehouseError("خواندن انبار تحلیلی ممکن نشد.");
            return;
          }
          await api.runAnalyticsEtl(workspaceId);
          refreshWarehouse();
        } catch (err: unknown) {
          setWarehouseError(friendlyErrorMessage(err, "اجرای ETL ممکن نشد"));
        }
      })();
    });
  }

  function refreshCharts() {
    if (!workspaceId || !chartsEnabled) {
      setExpenseTrend(null);
      setChartError(null);
      return;
    }
    void (async () => {
      try {
        const data = await api.workspaceChartExpenseTrend(workspaceId, 6);
        setExpenseTrend(data);
        setChartError(null);
      } catch (err: unknown) {
        setExpenseTrend(null);
        setChartError(friendlyErrorMessage(err, "خواندن روند خرج ممکن نشد"));
      }
    })();
  }

  function refresh() {
    if (!workspaceId) {
      setMetrics(null);
      setMyRole("");
      setWarehouse(null);
      setExpenseTrend(null);
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
      refreshWarehouse();
      refreshCharts();
    });
  }

  useEffect(() => {
    refresh();
  }, [workspaceId, chrome.actor?.userId, warehouseEnabled, chartsEnabled]);

  const rows = metrics
    ? ([
        {
          key: "workspace",
          label: "ساخت فضا",
          milestone: metrics.milestones.onboardingWorkspaceCreated,
          count: metrics.counts.workspaceCreates,
        },
        {
          key: "inviteCreate",
          label: "ساخت دعوت",
          milestone: metrics.milestones.inviteCreated,
          count: metrics.counts.inviteCreates,
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

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.metrics}
      description={"قیف و مایلستون‌ها از audit همین فضا."}
      primaryAction={<Button type="button" onClick={refresh} disabled={pending}>تازه‌سازی</Button>}
      state="ready"
    >
      <div>

      {!workspaceId ? (
        <EmptyStateBlock
          title="فضایی انتخاب نشده"
          description="از فهرست فضاها یک فضا باز کنید تا متریک همان فضا از audit خوانده شود."
          sticker="folder"
        />
      ) : null}

      {pending && !metrics ? (
        <ContentSkeleton rows={3} label="در حال خواندن متریک از audit…" />
      ) : null}
      {error ? (
        <EmptyStateBlock title="خواندن متریک ممکن نشد" description={error} sticker="shield" />
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
              description="بعد از ساخت فضا، دعوت اعضا، ثبت خرج و تأیید تسویه، شمارش‌ها از همان رویدادها پر می‌شوند."
              sticker="calendar"
              action={
                <a href={wPath(scope.slug, "members")}>رفتن به اعضا</a>
              }
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

      {warehouseEnabled ? (
        <SectionCard title="انبار تحلیلی (R10-20)">
          {warehouseError ? (
            <EmptyStateBlock title="انبار در دسترس نیست" description={warehouseError} sticker="folder" />
          ) : null}
          {warehouse ? (
            <>
              <StatusLine>
                حالت: {warehouseModeLabel(warehouse.mode)} · پایداری:{" "}
                {warehouse.persistence === "postgres" ? "Postgres" : "حافظه"} · آخرین ETL:{" "}
                {warehouse.lastRun
                  ? `${warehouse.lastRun.status} · ${formatWhen(warehouse.lastRun.finishedAt)} · ${warehouse.lastRun.rowsUpserted} روز`
                  : "هنوز اجرا نشده"}
              </StatusLine>
              <p style={{ marginTop: "0.5rem", opacity: 0.85 }}>{warehouse.note}</p>
              <div style={{ marginBlock: "0.75rem", display: "flex", gap: "0.5rem" }}>
                <button type="button" className="textButton" disabled={etlPending} onClick={runEtl}>
                  {etlPending ? "در حال ETL…" : "اجرای ETL از OLTP"}
                </button>
                <button
                  type="button"
                  className="textButton"
                  disabled={pending}
                  onClick={refreshWarehouse}
                >
                  بازخوانی انبار
                </button>
              </div>
              {warehouse.facts.length === 0 ? (
                <EmptyHint>
                  هنوز fact روزانه در انبار نیست — بعد از ثبت خرج posted، ETL را اجرا کنید.
                </EmptyHint>
              ) : (
                <ul className={styles.funnelList}>
                  {[...warehouse.facts]
                    .reverse()
                    .slice(0, 31)
                    .map((fact) => (
                      <li key={fact.day}>
                        <span>
                          <b>{fact.day}</b>
                          <small>
                            {fact.expenseCount.toLocaleString("fa-IR")} خرج ·{" "}
                            {formatMinorIrr(fact.totalMinor)} تومان · به‌روز{" "}
                            {formatWhen(fact.refreshedAt)}
                          </small>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </>
          ) : analyticsPlanOk === false ? (
            <EmptyStateBlock
              title="انبار در دسترس نیست"
              description="وضعیت انبار از API خوانده نشد. دادهٔ جعلی نشان داده نمی‌شود."
              sticker="folder"
            />
          ) : !warehouseError ? (
            <EmptyHint loading>در حال خواندن انبار…</EmptyHint>
          ) : null}
        </SectionCard>
      ) : null}

      {chartsEnabled ? (
        <SectionCard title="نمودار خرج (S11-11)">
          <p style={{ marginBottom: "0.75rem" }}>
            <a href={wPath(scope.slug, "charts")}>همهٔ نمودارهای فضا</a>
          </p>
          <SimpleBarChart
            title="روند خرج"
            series={expenseTrend}
            loading={pending && !expenseTrend}
            error={chartError}
            primaryLabel="جمع خرج (تومان)"
          />
        </SectionCard>
      ) : null}
    </div>
    </WorkspacePageFrame>
  );
}
