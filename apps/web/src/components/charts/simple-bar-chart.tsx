"use client";

import type { ChartSeriesResponse } from "@dang/contracts";
import { EmptyStateBlock } from "@/components/ui-blocks";
import styles from "./simple-bar-chart.module.css";

function formatMinor(minor: string): string {
  try {
    const toman = Number(BigInt(minor) / 10n);
    return new Intl.NumberFormat("fa-IR").format(toman);
  } catch {
    return minor;
  }
}

type Props = {
  title: string;
  series: ChartSeriesResponse | null;
  loading?: boolean;
  error?: string | null;
  /** When secondary exists, show dual bars (e.g. income vs expense). */
  secondaryLabel?: string;
  primaryLabel?: string;
};

/**
 * Accessible SVG bar chart + text table equivalent (S11-11 DoD).
 * Renders nothing decorative when points are empty — shows emptyReason.
 */
export function SimpleBarChart({
  title,
  series,
  loading,
  error,
  primaryLabel = "مقدار",
  secondaryLabel,
}: Props) {
  if (loading) {
    return (
      <section className={styles.wrap} aria-busy="true" aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.hint}>در حال خواندن داده…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className={styles.wrap} aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <EmptyStateBlock title="خواندن نمودار ممکن نشد" description={error} sticker="shield" />
      </section>
    );
  }
  if (!series || series.points.length === 0) {
    return (
      <section className={styles.wrap} aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <EmptyStateBlock
          title="داده‌ای برای نمودار نیست"
          description={series?.emptyReason ?? "هنوز دادهٔ واقعی ثبت نشده است"}
          sticker="calendar"
        />
      </section>
    );
  }

  const max = series.points.reduce((acc, p) => {
    const a = BigInt(p.valueMinor);
    const b = p.secondaryMinor ? BigInt(p.secondaryMinor) : 0n;
    const m = a > b ? a : b;
    return m > acc ? m : acc;
  }, 1n);

  const width = 320;
  const height = 120;
  const pad = 8;
  const barGap = 4;
  const groupWidth = (width - pad * 2) / series.points.length;
  const hasSecondary = series.points.some((p) => p.secondaryMinor != null);

  return (
    <section className={styles.wrap} aria-label={title}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.source}>منبع: {series.source}</p>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`chart-${series.chart}-title`}
      >
        <title id={`chart-${series.chart}-title`}>{title}</title>
        {series.points.map((point, index) => {
          const x0 = pad + index * groupWidth;
          const barW = hasSecondary ? (groupWidth - barGap * 3) / 2 : groupWidth - barGap * 2;
          const h1 = Number((BigInt(point.valueMinor) * BigInt(height - pad * 2)) / max);
          const y1 = height - pad - h1;
          const h2 = point.secondaryMinor
            ? Number((BigInt(point.secondaryMinor) * BigInt(height - pad * 2)) / max)
            : 0;
          const y2 = height - pad - h2;
          return (
            <g key={point.key}>
              <rect
                className={styles.barPrimary}
                x={x0 + barGap}
                y={y1}
                width={Math.max(barW, 1)}
                height={Math.max(h1, 1)}
              >
                <title>
                  {point.label}: {formatMinor(point.valueMinor)}
                </title>
              </rect>
              {point.secondaryMinor != null ? (
                <rect
                  className={styles.barSecondary}
                  x={x0 + barGap * 2 + barW}
                  y={y2}
                  width={Math.max(barW, 1)}
                  height={Math.max(h2, 1)}
                >
                  <title>
                    {point.label} (۲): {formatMinor(point.secondaryMinor)}
                  </title>
                </rect>
              ) : null}
            </g>
          );
        })}
      </svg>
      <table className={styles.table}>
        <caption className={styles.caption}>جدول معادل {title}</caption>
        <thead>
          <tr>
            <th scope="col">برچسب</th>
            <th scope="col">{primaryLabel}</th>
            {hasSecondary ? <th scope="col">{secondaryLabel ?? "مقدار دوم"}</th> : null}
          </tr>
        </thead>
        <tbody>
          {series.points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              <td>{formatMinor(point.valueMinor)}</td>
              {hasSecondary ? (
                <td>{point.secondaryMinor ? formatMinor(point.secondaryMinor) : "—"}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
