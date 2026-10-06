import type { ChartPoint, ChartSeriesResponse } from "@dang/contracts";
import {
  JALALI_MONTH_FA,
  parseIsoToJalali,
  weekdayFaSatFirst,
} from "@dang/contracts";
import {
  chartPointMinor,
  chartSecondaryMinor,
  formatChartToman,
} from "@/lib/chart-format";
import { formatFaDate } from "@/lib/fa-datetime";

/** YYYY-MM (میلادی API) → ماه شمسی پایدار (روز ۱۵ همان ماه). */
export function formatChartMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return ym;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return ym;
  const parts = parseIsoToJalali(`${m[1]}-${m[2]}-15`);
  if (!parts) return ym;
  const yearFa = parts.jy.toLocaleString("fa-IR", { useGrouping: false });
  return `${JALALI_MONTH_FA[parts.jm - 1]} ${yearFa}`;
}

/** YYYY-MM-DD → «شنبه ۱۴ شهریور ۱۴۰۵» */
export function formatChartDayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return day;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const parts = parseIsoToJalali(iso);
  if (!parts) return formatFaDate(iso);
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return formatFaDate(iso);
  const weekday = weekdayFaSatFirst(d.getDay());
  const dayFa = parts.jd.toLocaleString("fa-IR", { useGrouping: false });
  const yearFa = parts.jy.toLocaleString("fa-IR", { useGrouping: false });
  return `${weekday} ${dayFa} ${JALALI_MONTH_FA[parts.jm - 1]} ${yearFa}`;
}

/** بازهٔ from/to (Gregorian ISO) به برچسب شمسی کوتاه. */
export function formatChartRangeLabel(from: string, to: string): string {
  const a = formatFaDate(from);
  const b = formatFaDate(to);
  if (a === "—" && b === "—") return "";
  return `${a} تا ${b}`;
}

export function withFriendlyChartLabels(
  series: ChartSeriesResponse,
): ChartSeriesResponse {
  return {
    ...series,
    points: series.points.map((point) => {
      if (/^\d{4}-\d{2}$/.test(point.key)) {
        return { ...point, label: formatChartMonthLabel(point.key) };
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(point.key)) {
        return { ...point, label: formatChartDayLabel(point.key) };
      }
      return point;
    }),
    ...(series.from && series.to
      ? {
          from: series.from,
          to: series.to,
        }
      : {}),
  };
}

export type ChartInsight = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "up" | "down" | "attention";
};

function pctChange(prev: bigint, next: bigint): number | null {
  if (prev === 0n) return next === 0n ? 0 : null;
  return Number(((next - prev) * 1000n) / prev) / 10;
}

/** Insights derived only from real series points — never invented. */
export function buildTrendInsights(
  series: ChartSeriesResponse | null,
  title = "روند",
): ChartInsight[] {
  if (!series || series.points.length === 0) return [];
  const points = series.points;
  const last = points[points.length - 1]!;
  const prev = points.length > 1 ? points[points.length - 2]! : null;
  const lastVal = chartPointMinor(last);
  const insights: ChartInsight[] = [
    {
      key: "latest",
      label: `آخرین ${title}`,
      value: `${formatChartToman(lastVal)} تومان`,
      hint: last.label,
      tone: "neutral",
    },
  ];
  if (prev) {
    const change = pctChange(chartPointMinor(prev), lastVal);
    if (change != null) {
      const up = change > 0;
      insights.push({
        key: "mom",
        label: "تغییر نسبت به دوره قبل",
        value: `${Math.abs(change).toLocaleString("fa-IR")}٪ ${up ? "افزایش" : change < 0 ? "کاهش" : "بدون تغییر"}`,
        hint: `${prev.label} → ${last.label}`,
        tone: up ? "up" : change < 0 ? "down" : "neutral",
      });
    }
  }
  const peak = points.reduce((a, b) =>
    chartPointMinor(a) >= chartPointMinor(b) ? a : b,
  );
  insights.push({
    key: "peak",
    label: "اوج در بازه",
    value: `${formatChartToman(chartPointMinor(peak))} تومان`,
    hint: peak.label,
    tone: "attention",
  });
  return insights;
}

export function buildShareInsights(
  series: ChartSeriesResponse | null,
  entityLabel = "مورد",
  keyPrefix = "",
): ChartInsight[] {
  if (!series || series.points.length === 0) return [];
  const total = series.points.reduce((a, p) => a + chartPointMinor(p), 0n);
  if (total <= 0n) return [];
  const top = series.points.reduce((a, b) =>
    chartPointMinor(a) >= chartPointMinor(b) ? a : b,
  );
  const share = Number((chartPointMinor(top) * 1000n) / total) / 10;
  return [
    {
      key: `${keyPrefix}top`,
      label: `بیشترین ${entityLabel}`,
      value: top.label,
      hint: `${share.toLocaleString("fa-IR")}٪ · ${formatChartToman(chartPointMinor(top))} تومان`,
      tone: share >= 50 ? "attention" : "neutral",
    },
    {
      key: `${keyPrefix}count`,
      label: "تعداد اقلام",
      value: series.points.length.toLocaleString("fa-IR"),
      tone: "neutral",
    },
    {
      key: `${keyPrefix}total`,
      label: "جمع",
      value: `${formatChartToman(total)} تومان`,
      tone: "neutral",
    },
  ];
}

export function buildDualInsights(
  series: ChartSeriesResponse | null,
): ChartInsight[] {
  if (!series || series.points.length === 0) return [];
  let income = 0n;
  let expense = 0n;
  for (const p of series.points) {
    income += chartPointMinor(p);
    expense += chartSecondaryMinor(p);
  }
  const net = income - expense;
  return [
    {
      key: "income",
      label: "جمع درآمد بازه",
      value: `${formatChartToman(income)} تومان`,
      tone: "down",
    },
    {
      key: "expense",
      label: "جمع هزینه بازه",
      value: `${formatChartToman(expense)} تومان`,
      tone: "up",
    },
    {
      key: "net",
      label: "خالص",
      value: `${formatChartToman(net < 0n ? -net : net)} تومان ${net >= 0n ? "مثبت" : "منفی"}`,
      tone: net >= 0n ? "down" : "up",
    },
  ];
}

export function seriesToCsv(series: ChartSeriesResponse): string {
  const hasSecondary = series.points.some((p) => p.secondaryMinor != null);
  const header = hasSecondary
    ? "key,label,value_toman,secondary_toman"
    : "key,label,value_toman";
  const lines = series.points.map((p: ChartPoint) => {
    const v = formatChartToman(p.valueMinor).replace(/,/g, "");
    if (!hasSecondary) return `${p.key},"${p.label.replace(/"/g, '""')}",${v}`;
    const s = p.secondaryMinor ? formatChartToman(p.secondaryMinor).replace(/,/g, "") : "";
    return `${p.key},"${p.label.replace(/"/g, '""')}",${v},${s}`;
  });
  return [header, ...lines].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["\ufeff", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function rangeFromMonths(months: number, asOf = new Date()): {
  from: string;
  to: string;
} {
  const n = Math.min(36, Math.max(1, Math.floor(months)));
  const to = asOf.toISOString().slice(0, 10);
  const start = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (n - 1), 1),
  );
  const from = start.toISOString().slice(0, 10);
  return { from, to };
}

export type SpaceSpendRank = {
  id: string;
  slug: string;
  name: string;
  spendMinor: bigint;
  spendToman: number;
  series: ChartSeriesResponse | null;
  /** Share of kind total spend 0–100. */
  sharePct: number;
  /** Month-over-month % for last two points; null if not enough data. */
  momPct: number | null;
};

function seriesMomPct(series: ChartSeriesResponse): number | null {
  if (series.points.length < 2) return null;
  const prev = chartPointMinor(series.points[series.points.length - 2]!);
  const last = chartPointMinor(series.points[series.points.length - 1]!);
  if (prev === 0n) return last === 0n ? 0 : null;
  return Number(((last - prev) * 1000n) / prev) / 10;
}

/** Rank workspaces by summed expense-trend spend (real points only). */
export function rankSpacesBySpend(
  parts: readonly {
    id: string;
    slug: string;
    name: string;
    series: ChartSeriesResponse;
  }[],
): SpaceSpendRank[] {
  const mapped = parts.map((part) => {
    const spendMinor = part.series.points.reduce(
      (acc, p) => acc + chartPointMinor(p),
      0n,
    );
    return {
      id: part.id,
      slug: part.slug,
      name: part.name,
      spendMinor,
      spendToman: Number(spendMinor / 10n),
      series: part.series.points.length > 0 ? part.series : null,
      momPct: seriesMomPct(part.series),
      sharePct: 0,
    };
  });
  const total = mapped.reduce((acc, r) => acc + r.spendMinor, 0n);
  for (const row of mapped) {
    row.sharePct =
      total > 0n ? Number((row.spendMinor * 1000n) / total) / 10 : 0;
  }
  return mapped.sort((a, b) => {
    if (a.spendMinor === b.spendMinor) return a.name.localeCompare(b.name, "fa");
    return a.spendMinor > b.spendMinor ? -1 : 1;
  });
}

/** True when one space concentrates most of kind spend (honest signal). */
export function spendConcentration(
  ranks: readonly SpaceSpendRank[],
  thresholdPct = 50,
): { top: SpaceSpendRank; sharePct: number } | null {
  const top = ranks.find((r) => r.spendMinor > 0n);
  if (!top || top.sharePct < thresholdPct) return null;
  return { top, sharePct: top.sharePct };
}

/** Leaderboard series for ProChart hbar — top spenders. */
export function spendRanksToSeries(
  ranks: readonly SpaceSpendRank[],
): ChartSeriesResponse {
  const points = ranks
    .filter((r) => r.spendMinor > 0n)
    .map((r) => ({
      key: r.id,
      label: r.name,
      valueMinor: r.spendMinor.toString(),
    }));
  return {
    chart: "member-share",
    currency: "IRR",
    source: "merged_space_trends",
    points,
    emptyReason:
      points.length === 0 ? "در این بازه خرج ثبت‌شده‌ای برای رتبه‌بندی نیست" : undefined,
  };
}

export function parseReportMonths(raw: string | null | undefined): 3 | 6 | 12 {
  const n = Number(raw);
  if (n === 3 || n === 6 || n === 12) return n;
  return 6;
}

export function formatMomPct(momPct: number | null): {
  text: string;
  tone: "up" | "down" | "neutral";
} | null {
  if (momPct == null) return null;
  if (momPct === 0) return { text: "بدون تغییر", tone: "neutral" };
  const up = momPct > 0;
  return {
    text: `${Math.abs(momPct).toLocaleString("fa-IR")}٪ ${up ? "↑" : "↓"}`,
    tone: up ? "up" : "down",
  };
}

/** Kind-report balance table CSV — works without charts_v1 (G07 #39). */
export function kindBalanceRowsToCsv(
  rows: readonly {
    name: string;
    slug: string;
    net: { label: string; toman: number; tone: string };
    openSettlements: number;
  }[],
): string {
  const header = "name,slug,net_toman,net_tone,open_settlements";
  const lines = rows.map((r) => {
    const name = /[",\n]/.test(r.name) ? `"${r.name.replaceAll('"', '""')}"` : r.name;
    return `${name},${r.slug},${r.net.toman},${r.net.tone},${r.openSettlements}`;
  });
  return [header, ...lines].join("\n");
}
