"use client";

import type { ChartInsight } from "@/lib/chart-insights";
import styles from "./report-insights.module.css";

export function ReportInsights({
  title = "بینش گزارش",
  items,
}: {
  title?: string;
  items: readonly ChartInsight[];
}) {
  if (items.length === 0) return null;
  return (
    <section className={styles.wrap} aria-label={title}>
      <h3 className={styles.title}>{title}</h3>
      <ul className={styles.grid}>
        {items.map((item) => (
          <li
            key={item.key}
            className={`${styles.card}${item.tone ? ` ${styles[`tone_${item.tone}`]}` : ""}`}
          >
            <span className={styles.label}>{item.label}</span>
            <strong className={styles.value}>{item.value}</strong>
            {item.hint ? <small className={styles.hint}>{item.hint}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
