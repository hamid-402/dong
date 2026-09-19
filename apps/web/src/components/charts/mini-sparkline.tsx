"use client";

import type { ChartSeriesResponse } from "@dang/contracts";
import { chartMaxMinor, chartPointMinor } from "@/lib/chart-format";
import styles from "./mini-sparkline.module.css";

/**
 * Compact sparkline from a real ChartSeriesResponse — decorative only when
 * points exist; otherwise renders an honest empty dash.
 */
export function MiniSparkline({
  series,
  label,
  width = 88,
  height = 28,
}: {
  series: ChartSeriesResponse | null | undefined;
  label?: string;
  width?: number;
  height?: number;
}) {
  if (!series || series.points.length === 0) {
    return (
      <span className={styles.empty} aria-label={label ?? "بدون روند"}>
        —
      </span>
    );
  }

  const pad = 2;
  const max = chartMaxMinor(series.points);
  const n = series.points.length;
  const coords = series.points.map((point, index) => {
    const x = pad + (n === 1 ? (width - pad * 2) / 2 : (index / (n - 1)) * (width - pad * 2));
    const h = Number((chartPointMinor(point) * BigInt(height - pad * 2)) / max);
    const y = height - pad - h;
    return { x, y };
  });
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const last = coords[coords.length - 1]!;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label ?? "روند"}
    >
      <path className={styles.line} d={d} />
      <circle className={styles.dot} cx={last.x} cy={last.y} r={2.2} />
    </svg>
  );
}
