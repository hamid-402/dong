"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ChartSeriesResponse } from "@dang/contracts";
import { SectionCard, StatusLine } from "@/components/ui-blocks";
import { ProChart } from "@/components/charts/pro-chart";
import { ReportInsights } from "@/components/charts/report-insights";
import {
  ReportRangeToolbar,
  type ReportMonths,
} from "@/components/charts/report-range-toolbar";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  buildDualInsights,
  buildTrendInsights,
  downloadTextFile,
  seriesToCsv,
} from "@/lib/chart-insights";
import { useAppChrome } from "@/lib/use-app-chrome";

/** Personal chart strip for space / depth panels (S11-11). */
export function PersonalChartsPanel() {
  const chrome = useAppChrome();
  const chartsEnabled = chrome.capabilities?.providers?.charts === "charts_v1";
  const [months, setMonths] = useState<ReportMonths>(6);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [income, setIncome] = useState<ChartSeriesResponse | null>(null);
  const [burn, setBurn] = useState<ChartSeriesResponse | null>(null);
  const [goals, setGoals] = useState<ChartSeriesResponse | null>(null);

  useEffect(() => {
    if (!chartsEnabled || !chrome.actor?.userId) {
      setIncome(null);
      setBurn(null);
      setGoals(null);
      return;
    }
    startTransition(() => {
      void Promise.all([
        api.personalChartIncomeVsExpense(months),
        api.personalChartBudgetBurn(),
        api.personalChartGoalProgress(),
      ])
        .then(([i, b, g]) => {
          setIncome(i);
          setBurn(b);
          setGoals(g);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(friendlyErrorMessage(err, "خواندن نمودار شخصی ممکن نشد"));
        });
    });
  }, [chartsEnabled, chrome.actor?.userId, months]);

  const insights = useMemo(
    () => [...buildDualInsights(income), ...buildTrendInsights(burn, "خرج روز")].slice(0, 5),
    [income, burn],
  );

  if (!chartsEnabled) {
    return (
      <SectionCard title="گزارش و نمودارهای شخصی">
        <StatusLine>
          نمودار شخصی وقتی providers.charts برابر charts_v1 باشد فعال می‌شود — الان خاموش
          است؛ دادهٔ نمایشی نشان داده نمی‌شود.
        </StatusLine>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="گزارش و نمودارهای شخصی">
      <ReportRangeToolbar
        months={months}
        onMonthsChange={setMonths}
        disabled={pending}
        label="بازه درآمد/هزینه"
        onExport={
          income && income.points.length > 0
            ? () =>
                downloadTextFile(
                  `personal-income-expense-${months}m.csv`,
                  seriesToCsv(income),
                )
            : undefined
        }
      />
      <ReportInsights title="بینش مالی شخصی" items={insights} />
      {error ? (
        <StatusLine>
          <span role="alert">{error}</span>
        </StatusLine>
      ) : null}
      <div className="kindReports__grid">
        <ProChart
          title="درآمد در برابر هزینه"
          series={income}
          loading={pending && !income}
          variant="dualColumn"
          primaryLabel="درآمد (تومان)"
          secondaryLabel="هزینه (تومان)"
          exportable
        />
        <ProChart
          title="سوخت بودجه ماهانه"
          series={burn}
          loading={pending && !burn}
          variant="line"
          primaryLabel="خرج روز (تومان)"
          secondaryLabel="سقف بودجه"
          exportable
        />
        <ProChart
          title="پیشرفت اهداف پس‌انداز"
          series={goals}
          loading={pending && !goals}
          variant="progress"
          primaryLabel="واریز شده (تومان)"
          secondaryLabel="هدف"
          exportable
        />
      </div>
    </SectionCard>
  );
}
