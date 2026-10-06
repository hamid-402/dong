"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  spaceKindForTemplate,
  type AnalyticsWarehouseSnapshot,
  type ChartSeriesResponse,
} from "@dang/contracts";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import { EmptyHint, SectionCard, StatusLine } from "@/components/ui-blocks";
import { ProChart } from "@/components/charts/pro-chart";
import { ReportInsights } from "@/components/charts/report-insights";
import {
  ReportRangeToolbar,
  type ReportMonths,
} from "@/components/charts/report-range-toolbar";
import { api } from "@/lib/api";
import { workspaceAllowsAnalytics } from "@/lib/api/charts";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  buildShareInsights,
  buildTrendInsights,
  downloadTextFile,
  formatChartRangeLabel,
  rangeFromMonths,
  seriesToCsv,
  withFriendlyChartLabels,
} from "@/lib/chart-insights";
import { formatChartToman, chartPointMinor } from "@/lib/chart-format";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { wPath } from "@/lib/workspace-paths";
import styles from "./workspace-charts-view.module.css";

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

function seriesTotalToman(series: ChartSeriesResponse | null): string {
  if (!series || series.points.length === 0) return "—";
  const total = series.points.reduce((a, p) => a + chartPointMinor(p), 0n);
  return `${formatChartToman(total)} تومان`;
}

export function WorkspaceChartsView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const chartsEnabled = chrome.capabilities?.providers?.charts === "charts_v1";
  const warehouseEnabled = Boolean(chrome.capabilities?.providers?.analyticsWarehouse);
  const [months, setMonths] = useState<ReportMonths>(6);
  const [pending, startTransition] = useTransition();
  const [etlPending, startEtl] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [trend, setTrend] = useState<ChartSeriesResponse | null>(null);
  const [share, setShare] = useState<ChartSeriesResponse | null>(null);
  const [mix, setMix] = useState<ChartSeriesResponse | null>(null);
  const [balance, setBalance] = useState<ChartSeriesResponse | null>(null);
  const [warehouse, setWarehouse] = useState<AnalyticsWarehouseSnapshot | null>(null);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [warehousePlanDenied, setWarehousePlanDenied] = useState(false);
  const [warehouseLoading, setWarehouseLoading] = useState(false);

  const range = useMemo(() => rangeFromMonths(months), [months]);
  const rangeHint = useMemo(
    () => formatChartRangeLabel(range.from, range.to),
    [range.from, range.to],
  );

  const labeledTrend = useMemo(
    () => (trend ? withFriendlyChartLabels(trend) : null),
    [trend],
  );
  const labeledShare = useMemo(
    () => (share ? withFriendlyChartLabels(share) : null),
    [share],
  );
  const labeledMix = useMemo(
    () => (mix ? withFriendlyChartLabels(mix) : null),
    [mix],
  );
  const labeledBalance = useMemo(
    () => (balance ? withFriendlyChartLabels(balance) : null),
    [balance],
  );

  function refreshWarehouse() {
    if (!workspaceId || !warehouseEnabled) {
      setWarehouse(null);
      setWarehouseError(null);
      setWarehousePlanDenied(false);
      setWarehouseLoading(false);
      return;
    }
    setWarehouseLoading(true);
    void (async () => {
      try {
        const allowed = await workspaceAllowsAnalytics(workspaceId);
        if (!allowed) {
          setWarehouse(null);
          setWarehouseError(null);
          setWarehousePlanDenied(true);
          return;
        }
        const data = await api.analyticsWarehouse(workspaceId);
        setWarehouse(data);
        setWarehouseError(null);
        setWarehousePlanDenied(false);
      } catch (err: unknown) {
        setWarehouse(null);
        setWarehousePlanDenied(false);
        setWarehouseError(friendlyErrorMessage(err, "خواندن انبار تحلیلی ممکن نشد"));
      } finally {
        setWarehouseLoading(false);
      }
    })();
  }

  function runEtl() {
    if (!workspaceId || !warehouseEnabled || warehousePlanDenied) return;
    startEtl(() => {
      void (async () => {
        try {
          await api.runAnalyticsEtl(workspaceId);
          refreshWarehouse();
        } catch (err: unknown) {
          setWarehouseError(friendlyErrorMessage(err, "اجرای ETL ممکن نشد"));
        }
      })();
    });
  }

  function refresh() {
    if (!workspaceId || !chartsEnabled) {
      setTrend(null);
      setShare(null);
      setMix(null);
      setBalance(null);
      return;
    }
    const { from, to } = rangeFromMonths(months);
    startTransition(() => {
      void (async () => {
        try {
          const [t, s, m, b] = await Promise.all([
            api.workspaceChartExpenseTrend(workspaceId, months),
            api.workspaceChartMemberShare(workspaceId, from, to),
            api.workspaceChartCategoryMix(workspaceId, from, to),
            api.workspaceChartBalanceOverTime(workspaceId, from, to),
          ]);
          setTrend(t);
          setShare(s);
          setMix(m);
          setBalance(b);
          setError(null);
        } catch (err: unknown) {
          setTrend(null);
          setShare(null);
          setMix(null);
          setBalance(null);
          setError(friendlyErrorMessage(err, "خواندن نمودارها ممکن نشد"));
        }
      })();
    });
  }

  useEffect(() => {
    refresh();
    refreshWarehouse();
  }, [workspaceId, chartsEnabled, warehouseEnabled, chrome.actor?.userId, months]);

  useLiveInvalidation(["expenses", "balances", "settlements"], () => {
    refresh();
  });

  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = scope.slug || activeWs?.slug || "";
  const kind = spaceKindForTemplate(activeWs?.template);

  const insights = useMemo(
    () =>
      [
        ...buildTrendInsights(labeledTrend, "خرج"),
        ...buildShareInsights(labeledShare, "عضو", "member"),
        ...buildShareInsights(labeledMix, "دسته", "mix"),
      ],
    [labeledTrend, labeledShare, labeledMix],
  );

  const hasAnyPoints =
    (trend?.points.length ?? 0) > 0 ||
    (share?.points.length ?? 0) > 0 ||
    (mix?.points.length ?? 0) > 0 ||
    (balance?.points.length ?? 0) > 0;

  const topMember = labeledShare?.points.length
    ? labeledShare.points.reduce((a, b) =>
        chartPointMinor(a) >= chartPointMinor(b) ? a : b,
      )
    : null;

  if (!chartsEnabled) {
    return (
      <AppShell
        workspaceId={chrome.workspaceId}
        workspaceName={chrome.workspaceName || undefined}
        userName={chrome.userName || undefined}
        persistenceLabel={chrome.persistenceLabel}
      >
        <EmptyHint>
          نمودارها وقتی providers.charts برابر charts_v1 باشد در دسترس است.{" "}
          <Link href={`/spaces/reports?kind=${kind}`}>گزارش تجمیعی حوزه</Link>
        </EmptyHint>
      </AppShell>
    );
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.charts}
        description="داشبورد زندهٔ همین فضا — تاریخ‌ها شمسی؛ بازه را عوض کنید و بینش بگیرید."
        primaryAction={
          slug ? (
            <Link href={wPath(slug, "ledger")}>{NAV_LABELS.ledger}</Link>
          ) : (
            <Link href="/home">{NAV_LABELS.spacesList}</Link>
          )
        }
        secondaryActions={
          <Link href={`/spaces/reports?kind=${kind}`}>گزارش تجمیعی حوزه</Link>
        }
        state="ready"
      >
        <div className={styles.stack}>
          <ReportRangeToolbar
            months={months}
            onMonthsChange={setMonths}
            disabled={pending}
            rangeHint={rangeHint ? `شمسی: ${rangeHint}` : null}
            onPrint={() => window.print()}
            onExport={
              labeledTrend && labeledTrend.points.length > 0
                ? () =>
                    downloadTextFile(
                      `workspace-trend-${months}m.csv`,
                      seriesToCsv(labeledTrend),
                    )
                : undefined
            }
          />

          {hasAnyPoints ? (
            <div className={styles.summary} aria-label="خلاصهٔ بازه">
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>بازهٔ شمسی</span>
                <p className={styles.summaryValue}>{rangeHint || "—"}</p>
                <span className={styles.summaryHint}>
                  {months.toLocaleString("fa-IR")} ماه اخیر
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>جمع خرج بازه</span>
                <p className={styles.summaryValue}>{seriesTotalToman(labeledTrend)}</p>
                <span className={styles.summaryHint}>از روند ماهانه</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>بیشترین سهم عضو</span>
                <p className={styles.summaryValue}>{topMember?.label ?? "—"}</p>
                <span className={styles.summaryHint}>
                  {topMember
                    ? `${formatChartToman(chartPointMinor(topMember))} تومان`
                    : "داده کافی نیست"}
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>منبع داده</span>
                <p className={styles.summaryValue}>
                  {trend?.source === "analytics_daily_facts" ? "انبار تحلیلی" : "خرج ثبت‌شده"}
                </p>
                <span className={styles.summaryHint}>بدون دادهٔ نمایشی</span>
              </div>
            </div>
          ) : null}

          <ReportInsights title="بینش این فضا" items={insights} />

          {error ? <StatusLine>{error}</StatusLine> : null}

          {!pending && !error && !hasAnyPoints ? (
            <EmptyHint>
              هنوز خرج ثبت‌شده‌ای در این بازهٔ شمسی نیست تا نمودار ساخته شود.{" "}
              {slug ? (
                <>
                  <Link href={wPath(slug, "expenses")}>{NAV_LABELS.expenses}</Link>
                  {" · "}
                  <Link href={wPath(slug, "ledger")}>{NAV_LABELS.ledger}</Link>
                </>
              ) : null}
            </EmptyHint>
          ) : null}

          <div className={styles.grid}>
            <ProChart
              title="روند خرج ماهانه"
              series={labeledTrend}
              loading={pending && !trend}
              error={error}
              variant="line"
              primaryLabel="جمع خرج (تومان)"
              exportable
            />
            <ProChart
              title="سهم اعضا"
              series={labeledShare}
              loading={pending && !share}
              variant="donut"
              primaryLabel="سهم (تومان)"
              exportable
            />
            <ProChart
              title="ترکیب دسته‌بندی"
              series={labeledMix}
              loading={pending && !mix}
              variant="donut"
              primaryLabel="جمع (تومان)"
              exportable
            />
            <ProChart
              title="مانده طلب در زمان"
              series={labeledBalance}
              loading={pending && !balance}
              variant="line"
              primaryLabel="مانده طلب (تومان)"
              exportable
            />
          </div>

          {warehouseEnabled ? (
            <details className={styles.fold}>
              <summary>انبار تحلیلی (اختیاری)</summary>
              <div className={styles.foldBody}>
                {warehousePlanDenied ? (
                  <EmptyHint>
                    انبار تحلیلی الان در دسترس نیست. نمودارهای اصلی از خرج‌های
                    ثبت‌شده ساخته می‌شوند.
                  </EmptyHint>
                ) : warehouseError ? (
                  <StatusLine>{warehouseError}</StatusLine>
                ) : warehouseLoading ? (
                  <StatusLine>در حال بارگذاری وضعیت انبار…</StatusLine>
                ) : warehouse ? (
                  <>
                    <StatusLine>
                      حالت: {warehouseModeLabel(warehouse.mode)} · پایداری:{" "}
                      {warehouse.persistence === "postgres" ? "Postgres" : "حافظه"} ·
                      آخرین ETL:{" "}
                      {warehouse.lastRun
                        ? `${warehouse.lastRun.status} · ${formatFaDateTime(warehouse.lastRun.finishedAt)} · ${warehouse.lastRun.rowsUpserted.toLocaleString("fa-IR")} روز`
                        : "هنوز اجرا نشده"}
                    </StatusLine>
                    <p className="liveHint">{warehouse.note}</p>
                    <button
                      type="button"
                      className="textButton"
                      disabled={etlPending}
                      onClick={runEtl}
                    >
                      {etlPending ? "در حال ETL…" : "اجرای ETL"}
                    </button>
                    {slug ? (
                      <StatusLine>
                        جزئیات بیشتر در{" "}
                        <Link href={wPath(slug, "metrics")}>{NAV_LABELS.metrics}</Link>
                      </StatusLine>
                    ) : null}
                  </>
                ) : (
                  <StatusLine>وضعیت انبار در دسترس نیست.</StatusLine>
                )}
              </div>
            </details>
          ) : null}

          <SectionCard title="گزارش‌های مرتبط">
            <div className={styles.related}>
              {slug ? (
                <>
                  <Link href={wPath(slug, "invoices")}>{NAV_LABELS.invoices}</Link>
                  <Link href={wPath(slug, "settlements")}>{NAV_LABELS.settlements}</Link>
                  <Link href={wPath(slug, "expenses")}>{NAV_LABELS.expenses}</Link>
                  <Link href={wPath(slug, "ledger")}>{NAV_LABELS.ledger}</Link>
                </>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </WorkspacePageFrame>
    </AppShell>
  );
}
