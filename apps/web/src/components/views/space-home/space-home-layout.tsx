"use client";

import type { ReactNode } from "react";
import styles from "./space-home.module.css";

/**
 * Shared first-page skeleton for all four space kinds on /w/<slug>.
 * Kind-specific content is passed as slots; no decorative tile grids here.
 */
export function SpaceHomeLayout({
  title,
  roleBadge,
  primaryAction,
  secondaryAction,
  keyNumber,
  stats,
  actions,
  activity,
  chart,
  extras,
}: {
  title: string;
  roleBadge?: string | null;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  keyNumber: ReactNode;
  stats?: ReactNode;
  actions: ReactNode;
  activity: ReactNode;
  chart?: ReactNode;
  extras?: ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerLead}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {roleBadge ? <span className={styles.roleBadge}>{roleBadge}</span> : null}
          </div>
        </div>
        {primaryAction || secondaryAction ? (
          <div className={styles.actions}>
            {primaryAction}
            {secondaryAction}
          </div>
        ) : null}
      </header>

      <div className={styles.slotStats}>
        {keyNumber}
        {stats}
        {chart}
      </div>
      <div className={styles.slotActions}>{actions}</div>
      <aside className={styles.slotSide}>
        {activity}
        {extras ? <div className={styles.extras}>{extras}</div> : null}
      </aside>
    </div>
  );
}

export { styles as spaceHomeStyles };
