"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  spaceKindForTemplate,
  type ChartSeriesResponse,
  type ReportViewSummary,
  type SpaceKind,
} from "@dang/contracts";
import { ProChart } from "@/components/charts/pro-chart";
import { ReportInsights } from "@/components/charts/report-insights";
import {
  ReportRangeToolbar,
  type ReportMonths,
} from "@/components/charts/report-range-toolbar";
import { PageHeader, SectionCard, StatusLine, StatusPill } from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  formatChartToman,
  netsToShareSeries,
} from "@/lib/chart-format";
import {
  buildShareInsights,
  buildTrendInsights,
  downloadTextFile,
  formatMomPct,
  kindBalanceRowsToCsv,
  rankSpacesBySpend,
  seriesToCsv,
  spendConcentration,
  spendRanksToSeries,
} from "@/lib/chart-insights";
import { MiniSparkline } from "@/components/charts/mini-sparkline";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { netFromIrrMinor, type SpaceNetRow } from "@/lib/space-net-balance";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

type SortKey = "spend" | "net" | "settlements" | "name" | "share";

const KIND_ORDER: SpaceKind[] = ["personal", "group", "building", "org"];

/**
 * Full kind-level report dashboard — balances always; charts additive when charts_v1.
 * Cross-workspace chart fan-out is server-side (G07 #40).
 */
export function KindReportsView({
  kind,
  months: monthsProp,
  onMonthsChange,
}: {
  kind: SpaceKind;
  months?: ReportMonths;
  onMonthsChange?: (months: ReportMonths) => void;
}) {
  const chrome = useAppChrome();
  const chartsEnabled = chrome.capabilities?.providers?.charts === "charts_v1";
  const reportViewsEnabled =
    chrome.capabilities?.providers?.reportViews === "report_views_v1";
  const label = spaceTabLabel(kind);
  const [monthsLocal, setMonthsLocal] = useState<ReportMonths>(6);
  const months = monthsProp ?? monthsLocal;
  const setMonths = onMonthsChange ?? setMonthsLocal;
  const [sortKey, setSortKey] = useState<SortKey>(chartsEnabled ? "spend" : "net");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SpaceNetRow[]>([]);
  const [mergedTrend, setMergedTrend] = useState<ChartSeriesResponse | null>(null);
  const [mergedMix, setMergedMix] = useState<ChartSeriesResponse | null>(null);
  const [spaceTrends, setSpaceTrends] = useState<
    Array<{ id: string; slug: string; name: string; series: ChartSeriesResponse }>
  >([]);
  const [savedViews, setSavedViews] = useState<ReportViewSummary[]>([]);
  const [viewName, setViewName] = useState("");
  const [viewMsg, setViewMsg] = useState<string | null>(null);

  const spaces = useMemo(
    () =>
      chrome.workspaces.filter((ws) => spaceKindForTemplate(ws.template) === kind),
    [chrome.workspaces, kind],
  );

  useEffect(() => {
    setSortKey((prev) => {
      if (!chartsEnabled && (prev === "spend" || prev === "share")) return "net";
      return prev;
    });
  }, [chartsEnabled]);

  useEffect(() => {
    if (!chrome.ready || spaces.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dash = await api.personalDashboard();
        if (cancelled) return;
        const byId = new Map(
          dash.finance.workspaces.map((line) => [line.workspaceId, line] as const),
        );
        const next: SpaceNetRow[] = [];
        for (const ws of spaces) {
          const line = byId.get(ws.id);
          if (!line) continue;
          next.push({
            workspaceId: ws.id,
            slug: ws.slug,
            name: ws.name,
            spaceKind: kind,
            net: netFromIrrMinor(line.net.amountMinor),
            openSettlements: line.openSettlements,
          });
        }
        setRows(next);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, spaces, kind]);

  useEffect(() => {
    if (!chartsEnabled || spaces.length === 0) {
      setMergedTrend(null);
      setMergedMix(null);
      setSpaceTrends([]);
      return;
    }
    let cancelled = false;
    startTransition(() => {
      void (async () => {
        try {
          const agg = await api.kindChartsAggregate(kind, months);
          if (cancelled) return;
          setMergedTrend(agg.expenseTrend);
          setMergedMix(agg.categoryMix);
          setSpaceTrends(
            agg.spaces.map((s) => ({
              id: s.workspaceId,
              slug: s.slug,
              name: s.name,
              series: s.expenseTrend,
            })),
          );
          setError(null);
        } catch (err: unknown) {
          if (!cancelled) {
            setError(friendlyErrorMessage(err, "خواندن گزارش تجمیعی ممکن نشد"));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [chartsEnabled, kind, months, spaces.length]);

  useEffect(() => {
    if (!reportViewsEnabled || !chrome.ready) {
      setSavedViews([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listReportViews();
        if (!cancelled) setSavedViews(list.filter((v) => v.kind === kind));
      } catch {
        if (!cancelled) setSavedViews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportViewsEnabled, chrome.ready, kind]);

  const netShare = useMemo(() => netsToShareSeries(rows), [rows]);

  const spendRanks = useMemo(
    () => rankSpacesBySpend(spaceTrends),
    [spaceTrends],
  );
  const spendLeaderboard = useMemo(
    () => spendRanksToSeries(spendRanks),
    [spendRanks],
  );
  const openTotal = rows.reduce((n, r) => n + r.openSettlements, 0);
  const owed = rows.reduce(
    (n, r) => n + (r.net.tone === "credit" ? r.net.toman : 0),
    0,
  );
  const debt = rows.reduce(
    (n, r) => n + (r.net.tone === "debt" ? Math.abs(r.net.toman) : 0),
    0,
  );

  const rankedRows = useMemo(() => {
    const byId = new Map(spendRanks.map((r) => [r.id, r]));
    const list = spaces.map((ws) => {
      const row = rows.find((r) => r.workspaceId === ws.id);
      const spend = byId.get(ws.id);
      return { ws, row, spend };
    });
    list.sort((a, b) => {
      if (sortKey === "name") return a.ws.name.localeCompare(b.ws.name, "fa");
      if (sortKey === "settlements") {
        return (b.row?.openSettlements ?? 0) - (a.row?.openSettlements ?? 0);
      }
      if (sortKey === "net") {
        return Math.abs(b.row?.net.toman ?? 0) - Math.abs(a.row?.net.toman ?? 0);
      }
      if (sortKey === "share") {
        return (b.spend?.sharePct ?? 0) - (a.spend?.sharePct ?? 0);
      }
      const bs = b.spend?.spendMinor ?? 0n;
      const as = a.spend?.spendMinor ?? 0n;
      if (bs === as) return a.ws.name.localeCompare(b.ws.name, "fa");
      return bs > as ? 1 : -1;
    });
    return list;
  }, [spaces, rows, spendRanks, sortKey]);

  const concentration = useMemo(
    () => (chartsEnabled ? spendConcentration(spendRanks, 50) : null),
    [chartsEnabled, spendRanks],
  );

  const insights = useMemo(() => {
    const items = [
      ...(chartsEnabled ? buildTrendInsights(mergedTrend, "خرج حوزه") : []),
      ...(chartsEnabled ? buildShareInsights(mergedMix, "دسته") : []),
      ...(chartsEnabled ? buildShareInsights(spendLeaderboard, "فضا از نظر خرج") : []),
      ...buildShareInsights(netShare, "فضا از نظر مانده"),
    ];
    return items.slice(0, 8);
  }, [chartsEnabled, mergedTrend, mergedMix, netShare, spendLeaderboard]);

  function exportBalancesCsv() {
    downloadTextFile(
      `kind-${kind}-balances.csv`,
      kindBalanceRowsToCsv(
        rows.map((r) => ({
          name: r.name,
          slug: r.slug,
          net: r.net,
          openSettlements: r.openSettlements,
        })),
      ),
    );
  }

  function onSaveView() {
    const name = viewName.trim();
    if (!name) {
      setViewMsg("نام نما لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createReportView({
            name,
            kind,
            months,
            sortKey,
          });
          setSavedViews((prev) => [created, ...prev.filter((v) => v.id !== created.id)]);
          setViewName("");
          setViewMsg("نما ذخیره شد");
        } catch (err: unknown) {
          setViewMsg(friendlyErrorMessage(err, "ذخیرهٔ نما ناموفق"));
        }
      })();
    });
  }

  function applyView(view: ReportViewSummary) {
    setMonths(view.months);
    setSortKey(view.sortKey);
    setViewMsg(`نما «${view.name}» اعمال شد`);
  }

  function onDeleteView(id: string) {
    startTransition(() => {
      void (async () => {
        try {
          await api.deleteReportView(id);
          setSavedViews((prev) => prev.filter((v) => v.id !== id));
          setViewMsg("نما حذف شد");
        } catch (err: unknown) {
          setViewMsg(friendlyErrorMessage(err, "حذف نما ناموفق"));
        }
      })();
    });
  }

  if (!chrome.ready) {
    return <ContentSkeleton rows={4} label="در حال بارگذاری گزارش…" />;
  }

  const sortOptions: Array<{ key: SortKey; label: string }> = chartsEnabled
    ? [
        { key: "spend", label: "بیشترین خرج" },
        { key: "share", label: "سهم از حوزه" },
        { key: "net", label: "بیشترین مانده" },
        { key: "settlements", label: "تسویه باز" },
        { key: "name", label: "نام" },
      ]
    : [
        { key: "net", label: "بیشترین مانده" },
        { key: "settlements", label: "تسویه باز" },
        { key: "name", label: "نام" },
      ];

  return (
    <div className="kindReports">
      <PageHeader
        eyebrow="گزارش تجمیعی"
        title={`گزارش ${label}`}
        description={
          chartsEnabled
            ? `بینش و نمودار همهٔ فضاهای «${label}» — ثبت خرج و تسویه فقط داخل هر فضاست.`
            : `مانده و تسویهٔ باز همهٔ فضاهای «${label}» از داشبورد زنده — نمودار خرج وقتی charts_v1 فعال باشد اضافه می‌شود.`
        }
        actions={
          <>
            <Link className="textButton" href={`/spaces?kind=${kind}`}>
              فهرست فضاها
            </Link>
            <Link className="shell-v2__cta" href={`/spaces/new?kind=${kind}`}>
              ساخت فضای {label}
            </Link>
          </>
        }
      />

      <div className="kindReports__kindSwitch" role="tablist" aria-label="حوزه گزارش">
        {KIND_ORDER.map((k) => (
          <Link
            key={k}
            href={`/spaces/reports?kind=${k}&months=${months}`}
            role="tab"
            aria-selected={k === kind}
            className={`kindReports__chip${k === kind ? " is-active" : ""}`}
          >
            {spaceTabLabel(k)}
          </Link>
        ))}
      </div>

      {spaces.length === 0 ? (
        <SectionCard title={`هنوز فضای ${label} ندارید`}>
          <p>بعد از ساخت فضا، گزارش تجمیعی اینجا پر می‌شود.</p>
          <Link className="shell-v2__cta" href={`/spaces/new?kind=${kind}`}>
            ساخت فضای {label}
          </Link>
        </SectionCard>
      ) : (
        <>
          <section className="kindReports__kpi" aria-label="شاخص‌های حوزه">
            <article>
              <span>تعداد فضا</span>
              <strong>{spaces.length.toLocaleString("fa-IR")}</strong>
            </article>
            <article>
              <span>طلب کل حوزه</span>
              <strong className="is-credit">{owed.toLocaleString("fa-IR")}</strong>
            </article>
            <article>
              <span>بدهی کل حوزه</span>
              <strong className="is-debt">{debt.toLocaleString("fa-IR")}</strong>
            </article>
            <article>
              <span>تسویه باز</span>
              <strong>{openTotal.toLocaleString("fa-IR")}</strong>
            </article>
          </section>

          <ReportRangeToolbar
            months={months}
            onMonthsChange={setMonths}
            disabled={pending}
            onPrint={() => window.print()}
            onExport={
              chartsEnabled && mergedTrend && mergedTrend.points.length > 0
                ? () =>
                    downloadTextFile(
                      `kind-${kind}-trend-${months}m.csv`,
                      seriesToCsv(mergedTrend),
                    )
                : exportBalancesCsv
            }
          />

          <ReportInsights title="بینش سریع حوزه" items={insights} />

          {concentration ? (
            <aside className="kindReports__alert" role="status">
              <strong>تمرکز مخارج</strong>
              <p>
                «{concentration.top.name}» حدود{" "}
                {concentration.sharePct.toLocaleString("fa-IR")}٪ خرج این حوزه را در بازهٔ
                انتخابی دارد — برای جزئیات وارد همان فضا شوید.
              </p>
              <Link href={wPath(concentration.top.slug, "charts")}>
                نمودار «{concentration.top.name}»
              </Link>
            </aside>
          ) : null}

          {error ? <StatusLine>{error}</StatusLine> : null}

          {!chartsEnabled ? (
            <StatusLine>
              <StatusPill tone="warn">نمودار خرج</StatusPill>
              مقایسهٔ مانده از داشبورد فعال است. روند خرج و ترکیب دسته وقتی
              capabilities.providers.charts برابر charts_v1 باشد از API سرور می‌آید.
            </StatusLine>
          ) : null}

          <div className="kindReports__grid">
            {chartsEnabled ? (
              <>
                <ProChart
                  title={`روند خرج همهٔ فضاهای ${label}`}
                  series={mergedTrend}
                  loading={pending && !mergedTrend}
                  variant="line"
                  primaryLabel="جمع خرج (تومان)"
                  exportable
                />
                <ProChart
                  title={`رتبه‌بندی خرج فضاهای ${label}`}
                  series={spendLeaderboard}
                  loading={pending && spendRanks.length === 0 && spaces.length > 0}
                  variant="hbar"
                  primaryLabel="جمع خرج بازه (تومان)"
                  exportable
                />
              </>
            ) : null}
            <ProChart
              title="مقایسهٔ قدرمطلق ماندهٔ فضاها"
              series={netShare}
              variant="hbar"
              primaryLabel="مانده (تومان)"
              compact
              exportable
            />
            {chartsEnabled ? (
              <ProChart
                title={`ترکیب دسته در حوزهٔ ${label}`}
                series={mergedMix}
                loading={pending && !mergedMix}
                variant="donut"
                primaryLabel="جمع (تومان)"
                exportable
              />
            ) : null}
          </div>

          {kind === "personal" ? (
            <SectionCard title="مالی شخصی">
              <StatusLine>
                بودجه، درآمد/هزینه و اهداف در{" "}
                <Link href="/me/finance">{NAV_LABELS.personalFinance}</Link> با نمودارهای
                اختصاصی.
              </StatusLine>
            </SectionCard>
          ) : null}

          {reportViewsEnabled ? (
            <SectionCard title="نمای ذخیره‌شده">
              <div className="kindReports__saved">
                <label className="kindReports__savedField">
                  <span>نام نما</span>
                  <input
                    value={viewName}
                    onChange={(e) => setViewName(e.target.value)}
                    placeholder={`مثلاً ${label} شش‌ماهه`}
                  />
                </label>
                <button
                  type="button"
                  className="textButton"
                  disabled={pending}
                  onClick={onSaveView}
                >
                  ذخیرهٔ فیلتر فعلی
                </button>
              </div>
              {viewMsg ? <StatusLine>{viewMsg}</StatusLine> : null}
              {savedViews.length === 0 ? (
                <EmptyHintLocal />
              ) : (
                <ul className="kindReports__savedList">
                  {savedViews.map((v) => (
                    <li key={v.id}>
                      <button type="button" className="textButton" onClick={() => applyView(v)}>
                        {v.name}
                      </button>
                      <span>
                        {v.months}م · {v.sortKey}
                      </span>
                      <button
                        type="button"
                        className="textButton"
                        disabled={pending}
                        onClick={() => onDeleteView(v.id)}
                      >
                        حذف
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title={`جزئیات و رتبه‌بندی فضاهای ${label}`}>
            <p className="kindReports__tableLead">
              مرتب‌سازی بر اساس دادهٔ زنده — برای صورتحساب و جزئیات وارد همان فضا شوید.
            </p>
            <div className="kindReports__sort" role="group" aria-label="مرتب‌سازی جدول">
              {sortOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`kindReports__sortChip${sortKey === opt.key ? " is-active" : ""}`}
                  aria-pressed={sortKey === opt.key}
                  onClick={() => setSortKey(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="kindReports__tableWrap">
              <table className="kindReports__table">
                <thead>
                  <tr>
                    <th scope="col">رتبه</th>
                    <th scope="col">فضا</th>
                    {chartsEnabled ? (
                      <>
                        <th scope="col">روند</th>
                        <th scope="col">خرج بازه</th>
                        <th scope="col">سهم</th>
                        <th scope="col">تغییر دوره</th>
                      </>
                    ) : null}
                    <th scope="col">مانده</th>
                    <th scope="col">تسویه باز</th>
                    <th scope="col">گزارش‌ها</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedRows.map(({ ws, row, spend }, index) => {
                    const mom = formatMomPct(spend?.momPct ?? null);
                    return (
                      <tr key={ws.id}>
                        <td className="kindReports__rank">
                          {(index + 1).toLocaleString("fa-IR")}
                        </td>
                        <th scope="row">
                          <Link href={wPath(ws.slug, "space")}>{ws.name}</Link>
                        </th>
                        {chartsEnabled ? (
                          <>
                            <td>
                              <MiniSparkline
                                series={spend?.series}
                                label={`روند خرج ${ws.name}`}
                              />
                            </td>
                            <td className="kindReports__num">
                              {spend && spend.spendMinor > 0n
                                ? `${formatChartToman(spend.spendMinor)} تومان`
                                : "—"}
                            </td>
                            <td className="kindReports__num">
                              {spend && spend.spendMinor > 0n ? (
                                <span className="kindReports__share">
                                  <span
                                    className="kindReports__shareBar"
                                    style={{
                                      width: `${Math.min(100, spend.sharePct)}%`,
                                    }}
                                    aria-hidden
                                  />
                                  <span>
                                    {spend.sharePct.toLocaleString("fa-IR")}٪
                                  </span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {mom ? (
                                <span className={`kindReports__mom is-${mom.tone}`}>
                                  {mom.text}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </>
                        ) : null}
                        <td className={row ? `is-${row.net.tone}` : undefined}>
                          {row?.net.label ?? "…"}
                        </td>
                        <td>
                          {(row?.openSettlements ?? 0).toLocaleString("fa-IR")}
                        </td>
                        <td className="kindReports__ops">
                          <Link href={wPath(ws.slug, "invoices")}>صورتحساب</Link>
                          {chartsEnabled ? (
                            <Link href={wPath(ws.slug, "charts")}>نمودار</Link>
                          ) : null}
                          <Link href={wPath(ws.slug, "expenses")}>خرج</Link>
                          <Link href={wPath(ws.slug, "settlements")}>تسویه</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {chartsEnabled && spaceTrends.some((s) => s.series.points.length > 0) ? (
            <SectionCard title="روند خرج به‌تفکیک فضا">
              <div className="kindReports__grid kindReports__grid--stack">
                {spaceTrends
                  .filter((s) => s.series.points.length > 0)
                  .map((s) => (
                    <ProChart
                      key={s.id}
                      title={s.name}
                      series={s.series}
                      variant="line"
                      primaryLabel="خرج (تومان)"
                      compact
                      exportable
                    />
                  ))}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}

function EmptyHintLocal() {
  return <p className="kindReports__tableLead">هنوز نمایی برای این حوزه ذخیره نشده.</p>;
}
