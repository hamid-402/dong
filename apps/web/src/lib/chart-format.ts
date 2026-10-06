import type { ChartPoint, ChartSeriesResponse } from "@dang/contracts";

/** IRR minor → تومان با رقم‌های فارسی. */
export function formatChartToman(minor: string | number | bigint): string {
  try {
    const n =
      typeof minor === "bigint"
        ? minor / 10n
        : BigInt(typeof minor === "number" ? Math.trunc(minor) : minor) / 10n;
    return new Intl.NumberFormat("fa-IR").format(Number(n));
  } catch {
    return String(minor);
  }
}

export function chartPointMinor(point: ChartPoint): bigint {
  try {
    return BigInt(point.valueMinor);
  } catch {
    return 0n;
  }
}

export function chartSecondaryMinor(point: ChartPoint): bigint {
  if (point.secondaryMinor == null) return 0n;
  try {
    return BigInt(point.secondaryMinor);
  } catch {
    return 0n;
  }
}

export function chartMaxMinor(points: readonly ChartPoint[]): bigint {
  let max = 1n;
  for (const p of points) {
    const a = chartPointMinor(p);
    const b = chartSecondaryMinor(p);
    const t = p.tertiaryMinor
      ? (() => {
          try {
            return BigInt(p.tertiaryMinor);
          } catch {
            return 0n;
          }
        })()
      : 0n;
    const m = a > b ? (a > t ? a : t) : b > t ? b : t;
    if (m > max) max = m;
  }
  return max;
}

/**
 * Sum expense-trend (or similar single-value monthly series) across workspaces.
 * Months with zero total are omitted — no decorative zeros.
 */
export function mergeSumSeries(
  parts: readonly { label: string; series: ChartSeriesResponse }[],
  chart: ChartSeriesResponse["chart"] = "expense-trend",
): ChartSeriesResponse {
  const buckets = new Map<string, { label: string; value: bigint }>();
  const sourceParts: string[] = [];
  for (const part of parts) {
    if (part.series.points.length === 0) continue;
    sourceParts.push(part.label);
    for (const point of part.series.points) {
      const prev = buckets.get(point.key);
      const add = chartPointMinor(point);
      if (add <= 0n) continue;
      if (prev) {
        prev.value += add;
      } else {
        buckets.set(point.key, { label: point.label, value: add });
      }
    }
  }
  const points: ChartPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, v]) => v.value > 0n)
    .map(([key, v]) => ({
      key,
      label: v.label,
      valueMinor: v.value.toString(),
    }));
  return {
    chart,
    currency: "IRR",
    source:
      sourceParts.length > 0
        ? `merged:${sourceParts.slice(0, 6).join("+")}${sourceParts.length > 6 ? "+…" : ""}`
        : "merged:empty",
    points,
    emptyReason:
      points.length === 0 ? "در این حوزه هنوز خرج ثبت‌شده‌ای برای نمودار نیست" : undefined,
  };
}

/** One bar per space from live nets (IRR minor ≈ toman*10). */
export function netsToShareSeries(
  rows: readonly {
    workspaceId: string;
    name: string;
    net: { toman: number };
  }[],
): ChartSeriesResponse {
  const points: ChartPoint[] = rows
    .map((row) => ({
      key: row.workspaceId,
      label: row.name,
      valueMinor: String(Math.abs(Math.round(row.net.toman)) * 10),
    }))
    .filter((p) => chartPointMinor(p) > 0n)
    .sort((a, b) => {
      const d = chartPointMinor(b) - chartPointMinor(a);
      if (d === 0n) return a.label.localeCompare(b.label, "fa");
      return d > 0n ? 1 : -1;
    });
  return {
    chart: "member-share",
    currency: "IRR",
    source: "personal_dashboard_nets",
    points,
    emptyReason:
      points.length === 0 ? "همهٔ فضاهای این حوزه تسویه‌اند یا مانده صفر است" : undefined,
  };
}

const CHART_SOURCE_LABELS: Record<string, string> = {
  expenses_posted: "خرج‌های ثبت‌شده",
  expense_splits: "سهم اعضا",
  expense_provisional_balances: "ماندهٔ موقت",
  oltp_expenses_posted: "خرج‌های ثبت‌شده",
  analytics_daily_facts: "انبار تحلیلی",
  merged_space_trends: "روند فضاها",
  personal_dashboard_nets: "ماندهٔ شخصی",
  daily_ledger: "دفتر روزانه",
};

/** Persian caption for a chart series source. Unknown ids stay visible. */
export function chartSourceLabel(source: string): string {
  const known = CHART_SOURCE_LABELS[source];
  if (known) return known;
  if (source.startsWith("merged:")) return "چند فضا";
  return source;
}
