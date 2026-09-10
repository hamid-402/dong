"use client";

import Link from "next/link";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import styles from "./finance-operations-header.module.css";

export type FinanceOperationMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "attention";
};

export type FinanceOperationDestination = {
  key: string;
  label: string;
  href: string;
  active: boolean;
};

export function OperationsModuleHeader({
  metrics,
  destinations,
  roleLabel,
  persistenceLabel,
  pending,
  onRefresh,
  ariaLabel = "خلاصه عملیات",
}: {
  metrics: FinanceOperationMetric[];
  destinations: FinanceOperationDestination[];
  roleLabel: string | null;
  persistenceLabel: string;
  pending: boolean;
  onRefresh: () => void;
  ariaLabel?: string;
}) {
  return (
    <section className={styles.surface} aria-label={ariaLabel}>
      <header className={styles.commandRow}>
        <nav aria-label={`مسیرهای ${ariaLabel}`}>
          {destinations.map((destination) => (
            <Link
              key={destination.key}
              href={destination.href}
              className={destination.active ? styles.active : undefined}
              aria-current={destination.active ? "page" : undefined}
            >
              {destination.label}
            </Link>
          ))}
        </nav>
        <div className={styles.context}>
          {roleLabel ? <span><ShellIconSvg name="partners" />{roleLabel}</span> : null}
          <span><ShellIconSvg name="box" />{persistenceLabel}</span>
          <button type="button" disabled={pending} onClick={onRefresh}>
            {pending ? "در حال همگام‌سازی…" : "تازه‌سازی"}
          </button>
        </div>
      </header>

      <div className={styles.metrics}>
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={styles[`tone_${metric.tone ?? "neutral"}`]}
          >
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            {metric.detail ? <span>{metric.detail}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Backward-compatible finance name; the primitive is shared by all Operations Room modules. */
export const FinanceOperationsHeader = OperationsModuleHeader;
