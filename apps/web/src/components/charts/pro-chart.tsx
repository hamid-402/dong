"use client";

import { useId } from "react";
import type { ChartSeriesResponse } from "@dang/contracts";
import { EmptyStateBlock } from "@/components/ui-blocks";
import {
  chartMaxMinor,
  chartPointMinor,
  chartSecondaryMinor,
  chartSourceLabel,
  formatChartToman,
} from "@/lib/chart-format";
import {
  downloadTextFile,
  formatChartMonthLabel,
  formatChartRangeLabel,
  seriesToCsv,
  withFriendlyChartLabels,
} from "@/lib/chart-insights";
import styles from "./pro-chart.module.css";

const DONUT_COLORS = [
  "#2f9f86",
  "#d99a2e",
  "#4a8fe0",
  "#d46a90",
  "#8b6fd0",
  "#74b812",
  "#d9773a",
  "#718392",
];

export type ProChartVariant =
  | "column"
  | "dualColumn"
  | "line"
  | "donut"
  | "hbar"
  | "progress";

type Props = {
  title: string;
  series: ChartSeriesResponse | null;
  loading?: boolean;
  error?: string | null;
  variant?: ProChartVariant;
  primaryLabel?: string;
  secondaryLabel?: string;
  /** Hide data table (still keep SVG accessible via titles). */
  compact?: boolean;
  /** Offer CSV download of the live series. */
  exportable?: boolean;
};

function pickVariant(
  series: ChartSeriesResponse | null,
  explicit?: ProChartVariant,
): ProChartVariant {
  if (explicit) return explicit;
  if (!series) return "column";
  switch (series.chart) {
    case "income-vs-expense":
      return "dualColumn";
    case "expense-trend":
    case "balance-over-time":
    case "budget-burn":
      return "line";
    case "category-mix":
    case "member-share":
      return "donut";
    case "goal-progress":
      return "progress";
    default:
      return "column";
  }
}

/**
 * Professional SVG report chart — real ChartSeriesResponse only.
 * Variants: column, dualColumn, line/area, donut, horizontal bars, goal progress.
 */
export function ProChart({
  title,
  series: rawSeries,
  loading,
  error,
  variant: variantProp,
  primaryLabel = "مقدار",
  secondaryLabel,
  compact = false,
  exportable = false,
}: Props) {
  const series = rawSeries ? withFriendlyChartLabels(rawSeries) : null;
  const variant = pickVariant(series, variantProp);

  if (loading) {
    return (
      <section className={styles.panel} aria-busy="true" aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.skeleton} aria-hidden>
          <span className={styles.skeletonBar} />
          <span className={`${styles.skeletonBar} ${styles.skeletonBarTall}`} />
          <span className={styles.skeletonBar} />
          <span className={`${styles.skeletonBar} ${styles.skeletonBarMid}`} />
          <span className={styles.skeletonBar} />
          <span className={`${styles.skeletonBar} ${styles.skeletonBarTall}`} />
        </div>
        <p className={styles.hint}>در حال خواندن دادهٔ واقعی…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className={styles.panel} aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <EmptyStateBlock title="خواندن نمودار ممکن نشد" description={error} sticker="shield" />
      </section>
    );
  }
  if (!series || series.points.length === 0) {
    return (
      <section className={styles.panel} aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <EmptyStateBlock
          title="داده‌ای برای گزارش نیست"
          description={series?.emptyReason ?? "هنوز دادهٔ واقعی ثبت نشده است"}
          sticker="chartEmpty"
          stickerSize={64}
        />
      </section>
    );
  }

  const total = series.points.reduce((acc, p) => acc + chartPointMinor(p), 0n);
  const hasSecondary = series.points.some((p) => p.secondaryMinor != null);

  return (
    <section className={`${styles.panel} reportPrintBlock`} aria-label={title}>
      <header className={styles.panelHead}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{title}</h3>
          {exportable ? (
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() =>
                downloadTextFile(
                  `${series.chart}-${series.points[0]?.key ?? "report"}.csv`,
                  seriesToCsv(series),
                )
              }
            >
              CSV
            </button>
          ) : null}
        </div>
        <p className={styles.meta}>
          <span>
            منبع:{" "}
            <span className={styles.stat} title={series.source}>
              {chartSourceLabel(series.source)}
            </span>
          </span>
          {series.months != null ? (
            <span>
              بازه:{" "}
              <span className={styles.stat}>
                {series.months.toLocaleString("fa-IR")} ماه
              </span>
            </span>
          ) : null}
          {series.from && series.to ? (
            <span>
              شمسی:{" "}
              <span className={styles.stat}>
                {formatChartRangeLabel(series.from, series.to)}
              </span>
            </span>
          ) : null}
          {series.yearMonth ? (
            <span>
              ماه:{" "}
              <span className={styles.stat}>
                {formatChartMonthLabel(series.yearMonth)}
              </span>
            </span>
          ) : null}
          {total > 0n && variant !== "dualColumn" && variant !== "progress" ? (
            <span>
              جمع: <span className={styles.stat}>{formatChartToman(total)} تومان</span>
            </span>
          ) : null}
        </p>
      </header>

      {variant === "line" ? (
        <LineChart series={series} title={title} />
      ) : variant === "donut" ? (
        <DonutChart series={series} />
      ) : variant === "hbar" ? (
        <HBarChart series={series} />
      ) : variant === "progress" ? (
        <ProgressChart series={series} />
      ) : (
        <ColumnChart
          series={series}
          title={title}
          dual={variant === "dualColumn" || hasSecondary}
        />
      )}

      {(variant === "dualColumn" || hasSecondary) && variant !== "progress" ? (
        <ul className={styles.legend}>
          <li>
            <i className={styles.legendPrimary} aria-hidden />
            {primaryLabel}
          </li>
          <li>
            <i className={styles.legendSecondary} aria-hidden />
            {secondaryLabel ?? "مقدار دوم"}
          </li>
        </ul>
      ) : null}

      {!compact ? (
        <table className={styles.table}>
          <caption className={styles.caption}>جدول معادل {title}</caption>
          <thead>
            <tr>
              <th scope="col">برچسب</th>
              <th scope="col">{primaryLabel}</th>
              {hasSecondary ? (
                <th scope="col">{secondaryLabel ?? "مقدار دوم"}</th>
              ) : null}
              {variant === "donut" || variant === "hbar" ? (
                <th scope="col">سهم</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {series.points.map((point) => {
              const share =
                total > 0n
                  ? Number((chartPointMinor(point) * 1000n) / total) / 10
                  : 0;
              return (
                <tr key={point.key}>
                  <th scope="row">{point.label}</th>
                  <td>{formatChartToman(point.valueMinor)}</td>
                  {hasSecondary ? (
                    <td>
                      {point.secondaryMinor
                        ? formatChartToman(point.secondaryMinor)
                        : "—"}
                    </td>
                  ) : null}
                  {variant === "donut" || variant === "hbar" ? (
                    <td>{share.toLocaleString("fa-IR")}٪</td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function ColumnChart({
  series,
  title,
  dual,
}: {
  series: ChartSeriesResponse;
  title: string;
  dual: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const width = 420;
  const height = 168;
  const padX = 28;
  const padY = 18;
  const max = chartMaxMinor(series.points);
  const plotH = height - padY * 2;
  const plotW = width - padX * 2;
  const groupW = plotW / series.points.length;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`proChartPrimary-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3db89a" />
          <stop offset="100%" stopColor="#1a6b58" />
        </linearGradient>
        <linearGradient id={`proChartSecondary-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0b45a" />
          <stop offset="100%" stopColor="#9a6f18" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = padY + plotH * (1 - f);
        return (
          <line
            key={f}
            className={styles.gridLine}
            x1={padX}
            x2={width - padX}
            y1={y}
            y2={y}
          />
        );
      })}
      {series.points.map((point, index) => {
        const x0 = padX + index * groupW;
        const barW = dual ? (groupW - 10) / 2 : groupW - 10;
        const h1 = Number((chartPointMinor(point) * BigInt(plotH)) / max);
        const y1 = padY + plotH - h1;
        const h2 = Number((chartSecondaryMinor(point) * BigInt(plotH)) / max);
        const y2 = padY + plotH - h2;
        return (
          <g key={point.key}>
            <rect
              fill={`url(#proChartPrimary-${gid})`}
              x={x0 + 4}
              y={y1}
              width={Math.max(barW, 2)}
              height={Math.max(h1, 1)}
              rx={4}
            >
              <title>
                {point.label}: {formatChartToman(point.valueMinor)}
              </title>
            </rect>
            {dual && point.secondaryMinor != null ? (
              <rect
                fill={`url(#proChartSecondary-${gid})`}
                x={x0 + 4 + barW + 3}
                y={y2}
                width={Math.max(barW, 2)}
                height={Math.max(h2, 1)}
                rx={4}
              >
                <title>
                  {point.label}: {formatChartToman(point.secondaryMinor)}
                </title>
              </rect>
            ) : null}
            <text
              className={styles.axisLabel}
              x={x0 + groupW / 2}
              y={height - 4}
              textAnchor="middle"
            >
              {point.label.length > 8 ? `${point.label.slice(0, 7)}…` : point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({
  series,
  title,
}: {
  series: ChartSeriesResponse;
  title: string;
}) {
  const gid = useId().replace(/:/g, "");
  const width = 420;
  const height = 168;
  const padX = 28;
  const padY = 20;
  const max = chartMaxMinor(series.points);
  const plotH = height - padY * 2;
  const plotW = width - padX * 2;
  const n = series.points.length;
  const coords = series.points.map((point, index) => {
    const x = padX + (n === 1 ? plotW / 2 : (index / (n - 1)) * plotW);
    const h = Number((chartPointMinor(point) * BigInt(plotH)) / max);
    const y = padY + plotH - h;
    return { x, y, point };
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1]!.x},${padY + plotH} L${coords[0]!.x},${padY + plotH} Z`;
  const last = coords[coords.length - 1]!;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`proChartArea-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f9f86" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2f9f86" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = padY + plotH * (1 - f);
        return (
          <line
            key={f}
            className={styles.gridLine}
            x1={padX}
            x2={width - padX}
            y1={y}
            y2={y}
          />
        );
      })}
      <path fill={`url(#proChartArea-${gid})`} d={area} opacity={0.9} />
      <path className={styles.linePrimary} d={line} />
      {coords.map(({ x, y, point }, index) => (
        <g key={point.key}>
          <circle
            className={index === coords.length - 1 ? styles.dotHot : styles.dot}
            cx={x}
            cy={y}
            r={index === coords.length - 1 ? 4.5 : 3.5}
          >
            <title>
              {point.label}: {formatChartToman(point.valueMinor)}
            </title>
          </circle>
          <text className={styles.axisLabel} x={x} y={height - 4} textAnchor="middle">
            {point.label.length > 7 ? point.label.slice(0, 6) : point.label}
          </text>
        </g>
      ))}
      <text
        className={styles.valueTag}
        x={last.x}
        y={Math.max(12, last.y - 8)}
        textAnchor="middle"
      >
        {formatChartToman(last.point.valueMinor)}
      </text>
    </svg>
  );
}

function DonutChart({ series }: { series: ChartSeriesResponse }) {
  const total = series.points.reduce((acc, p) => acc + chartPointMinor(p), 0n);
  const cx = 80;
  const cy = 80;
  const r = 58;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const arcs: Array<{ point: (typeof series.points)[number]; dash: number; offset: number }> = [];
  {
    let cursor = 0;
    for (const point of series.points) {
      const value = chartPointMinor(point);
      const frac = total > 0n ? Number(value) / Number(total) : 0;
      const dash = frac * c;
      arcs.push({ point, dash, offset: cursor });
      cursor += dash;
    }
  }

  return (
    <div className={styles.donutWrap}>
      <svg
        className={styles.svg}
        viewBox="0 0 160 160"
        role="img"
        aria-label="سهم‌ها"
        width={160}
        height={160}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--line) 80%, transparent)"
          strokeWidth={stroke}
        />
        {arcs.map((arc, index) => (
          <circle
            key={arc.point.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
            strokeWidth={stroke}
            strokeDasharray={`${arc.dash} ${c - arc.dash}`}
            strokeDashoffset={-arc.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          >
            <title>
              {arc.point.label}: {formatChartToman(arc.point.valueMinor)}
            </title>
          </circle>
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill="var(--text)"
          fontSize="11"
          fontWeight="700"
        >
          {formatChartToman(total)}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="9"
        >
          تومان
        </text>
      </svg>
      <ul className={styles.donutLegend}>
        {series.points.map((point, index) => {
          const share =
            total > 0n
              ? Number((chartPointMinor(point) * 1000n) / total) / 10
              : 0;
          return (
            <li key={point.key}>
              <span
                className={styles.swatch}
                style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}
                aria-hidden
              />
              <span>{point.label}</span>
              <strong>
                {share.toLocaleString("fa-IR")}٪ · {formatChartToman(point.valueMinor)}
              </strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HBarChart({ series }: { series: ChartSeriesResponse }) {
  const max = chartMaxMinor(series.points);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {series.points.map((point) => {
        const pct = Number((chartPointMinor(point) * 1000n) / max) / 10;
        return (
          <div key={point.key} className={styles.hbarRow}>
            <span className={styles.hbarLabel} title={point.label}>
              {point.label}
            </span>
            <div className={styles.hbarTrack} aria-hidden>
              <span className={styles.hbarFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={styles.hbarVal}>{formatChartToman(point.valueMinor)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressChart({ series }: { series: ChartSeriesResponse }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {series.points.map((point) => {
        const done = chartPointMinor(point);
        const target = chartSecondaryMinor(point);
        const pct =
          target > 0n
            ? Math.min(100, Number((done * 1000n) / target) / 10)
            : 0;
        return (
          <div key={point.key} className={styles.progressRow}>
            <div className={styles.progressMeta}>
              <strong>{point.label}</strong>
              <span>
                {formatChartToman(point.valueMinor)}
                {point.secondaryMinor
                  ? ` / ${formatChartToman(point.secondaryMinor)}`
                  : ""}{" "}
                · {pct.toLocaleString("fa-IR")}٪
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
