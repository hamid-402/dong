"use client";

import Link from "next/link";
import type { ShellIcon } from "@/components/shell/shell-icons";
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
  icon?: ShellIcon;
  hint?: string;
};

/**
 * Ops strip for procurement / proposals / partnership — metrics and links
 * must come from live API state at the call site (no invented numbers).
 */
export function OperationsModuleHeader({
  metrics,
  destinations,
  roleLabel,
  persistenceLabel,
  pending,
  onRefresh,
  ariaLabel,
  density = "default",
}: {
  metrics: FinanceOperationMetric[];
  destinations: FinanceOperationDestination[];
  roleLabel: string | null;
  persistenceLabel: string;
  pending: boolean;
  onRefresh: () => void;
  ariaLabel?: string;
  density?: "default" | "compact";
  allowShellPrimaryDestinations?: boolean;
}) {
  const active = destinations.find((d) => d.active) ?? destinations[0];
  const title = active?.label ?? ariaLabel ?? "عملیات";
  const compact = density === "compact";
  const surfaceClass = [
    styles.surface,
    compact ? styles.surfaceCompact : styles.surfaceRich,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={surfaceClass} aria-label={ariaLabel ?? title}>
      <div className={styles.commandRow}>
        <h1
          className="moduleChrome__title"
          style={{ margin: 0, fontSize: compact ? "1.05rem" : "1.15rem", flex: "0 0 auto" }}
        >
          {title}
        </h1>
        {destinations.length > 1 ? (
          <nav className={styles.navRich} aria-label={ariaLabel ?? "میانبر ماژول"}>
            {destinations.map((d) => {
              const itemClass = [
                styles.navItemRich,
                d.active ? styles.active : null,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <Link
                  key={d.key}
                  href={d.href}
                  className={itemClass}
                  aria-current={d.active ? "page" : undefined}
                >
                  {d.icon ? (
                    <span className={styles.navIcon} aria-hidden>
                      <ShellIconSvg name={d.icon} />
                    </span>
                  ) : null}
                  <span className={styles.navCopy}>
                    <strong>{d.label}</strong>
                    {d.hint ? <small>{d.hint}</small> : null}
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className={styles.navPlaceholder} />
        )}
        <div className={styles.context}>
          {roleLabel ? <span>{roleLabel}</span> : null}
          <span>{persistenceLabel}</span>
          <button type="button" onClick={onRefresh} disabled={pending}>
            {pending ? "…" : "تازه‌سازی"}
          </button>
        </div>
      </div>
      {metrics.length > 0 ? (
        <div className={styles.metrics} role="group" aria-label="شاخص‌های زنده">
          {metrics.map((m) => {
            const toneClass =
              m.tone === "positive"
                ? styles.tone_positive
                : m.tone === "attention"
                  ? styles.tone_attention
                  : undefined;
            return (
              <div key={m.label} className={toneClass}>
                <small>{m.label}</small>
                <strong>{m.value}</strong>
                {m.detail ? <span>{m.detail}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export const FinanceOperationsHeader = OperationsModuleHeader;
