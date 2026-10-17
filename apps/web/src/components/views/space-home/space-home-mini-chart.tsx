"use client";

import Link from "next/link";
import type { ChartSeriesResponse } from "@dang/contracts";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { wPath } from "@/lib/workspace-paths";
import styles from "./space-home.module.css";

/**
 * Compact chart card linking to the full charts page. Hide when charts are off
 * or there is no series (parent should not render this component).
 */
export function SpaceHomeMiniChart({
  slug,
  series,
  title = "نمای کوتاه",
}: {
  slug: string;
  series: ChartSeriesResponse;
  title?: string;
}) {
  if (!series.points.length) return null;

  return (
    <section className={styles.chartCard} aria-label={title}>
      <SimpleBarChart
        title={title}
        series={series}
        primaryLabel="درآمد"
        secondaryLabel="خرج"
      />
      <Link href={wPath(slug, "charts")} className={styles.chartLink}>
        نمودار کامل ←
      </Link>
    </section>
  );
}
