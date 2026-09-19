"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  spaceKindForTemplate,
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
import { ApiError } from "@/lib/api/client";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  buildShareInsights,
  buildTrendInsights,
  downloadTextFile,
  rangeFromMonths,
  seriesToCsv,
} from "@/lib/chart-insights";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { wPath } from "@/lib/workspace-paths";

export function WorkspaceChartsView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const chartsEnabled = chrome.capabilities?.providers?.charts === "charts_v1";
  const [months, setMonths] = useState<ReportMonths>(6);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [planDenied, setPlanDenied] = useState(false);
  const [trend, setTrend] = useState<ChartSeriesResponse | null>(null);
  const [share, setShare] = useState<ChartSeriesResponse | null>(null);
  const [mix, setMix] = useState<ChartSeriesResponse | null>(null);
  const [balance, setBalance] = useState<ChartSeriesResponse | null>(null);

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
      void Promise.all([
        api.workspaceChartExpenseTrend(workspaceId, months),
        api.workspaceChartMemberShare(workspaceId, from, to),
        api.workspaceChartCategoryMix(workspaceId, from, to),
        api.workspaceChartBalanceOverTime(workspaceId, from, to),
      ])
        .then(([t, s, m, b]) => {
          setTrend(t);
          setShare(s);
          setMix(m);
          setBalance(b);
          setError(null);
          setPlanDenied(false);
        })
        .catch((err: unknown) => {
          setTrend(null);
          setShare(null);
          setMix(null);
          setBalance(null);
          if (
            err instanceof ApiError &&
            (err.code === "plan_required" ||
              /Plan upgrade required|در پلن .+ فعال نیست/i.test(err.message))
          ) {
            setPlanDenied(true);
            setError(null);
            return;
          }
          setPlanDenied(false);
          setError(friendlyErrorMessage(err, "خواندن نمودارها ممکن نشد"));
        });
    });
  }

  useEffect(() => {
    refresh();
  }, [workspaceId, chartsEnabled, chrome.actor?.userId, months]);

  useLiveInvalidation(["expenses", "balances", "settlements"], () => {
    refresh();
  });

  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = scope.slug || activeWs?.slug || "";
  const kind = spaceKindForTemplate(activeWs?.template);

  const insights = useMemo(
    () => [
      ...buildTrendInsights(trend, "خرج"),
      ...buildShareInsights(share, "عضو"),
      ...buildShareInsights(mix, "دسته"),
    ].slice(0, 6),
    [trend, share, mix],
  );

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
        description="گزارش دقیق همین فضا از دادهٔ زنده — بازه را عوض کنید، بینش و خروجی بگیرید."
        primaryAction={
          slug ? (
            <Link href={wPath(slug, "ledger")}>{NAV_LABELS.ledger}</Link>
          ) : (
            <Link href="/spaces">{NAV_LABELS.spacesList}</Link>
          )
        }
        secondaryActions={
          <Link href={`/spaces/reports?kind=${kind}`}>گزارش تجمیعی حوزه</Link>
        }
        state="ready"
      >
        <ReportRangeToolbar
          months={months}
          onMonthsChange={setMonths}
          disabled={pending}
          onPrint={() => window.print()}
          onExport={
            trend && trend.points.length > 0
              ? () =>
                  downloadTextFile(
                    `workspace-trend-${months}m.csv`,
                    seriesToCsv(trend),
                  )
              : undefined
          }
        />

        <ReportInsights title="بینش این فضا" items={insights} />

        {planDenied ? (
          <EmptyHint>
            نمودار فضای کاری پشت قابلیت analytics پلن است — روی پلن فعلی در دسترس نیست.{" "}
            {slug ? (
              <Link href={wPath(slug, "settings")}>تنظیمات / پلن فضا</Link>
            ) : (
              <Link href={`/spaces/reports?kind=${kind}`}>گزارش تجمیعی حوزه</Link>
            )}{" "}
            · دادهٔ جعلی نشان داده نمی‌شود.
          </EmptyHint>
        ) : null}
        {error ? <StatusLine>{error}</StatusLine> : null}
        {!planDenied ? (
        <div className="kindReports__grid">
          <ProChart
            title="روند خرج ماهانه"
            series={trend}
            loading={pending && !trend}
            error={error}
            variant="line"
            primaryLabel="جمع خرج (تومان)"
            exportable
          />
          <ProChart
            title="سهم اعضا"
            series={share}
            loading={pending && !share}
            variant="donut"
            primaryLabel="سهم (تومان)"
            exportable
          />
          <ProChart
            title="ترکیب دسته‌بندی"
            series={mix}
            loading={pending && !mix}
            variant="donut"
            primaryLabel="جمع (تومان)"
            exportable
          />
          <ProChart
            title="مانده طلب در زمان"
            series={balance}
            loading={pending && !balance}
            variant="line"
            primaryLabel="مانده طلب (تومان)"
            exportable
          />
        </div>
        ) : null}
        <SectionCard title="گزارش‌های مرتبط">
          <StatusLine>
            {slug ? (
              <>
                <Link href={wPath(slug, "invoices")}>{NAV_LABELS.invoices}</Link>
                {" · "}
                <Link href={wPath(slug, "settlements")}>{NAV_LABELS.settlements}</Link>
                {" · "}
                <Link href={wPath(slug, "expenses")}>{NAV_LABELS.expenses}</Link>
              </>
            ) : null}
          </StatusLine>
        </SectionCard>
      </WorkspacePageFrame>
    </AppShell>
  );
}
