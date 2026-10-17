"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./space-home.module.css";

export type SpaceHomeActionItem = {
  id: string;
  title: string;
  detail?: string;
  href: string;
  actionLabel: string;
};

const EMPTY_LINE = "الان کار بازی برای اقدام نیست.";

/**
 * Short pending queue (max 5). Hidden when empty — calm line instead.
 */
export function SpaceHomeActions({
  items,
  emptyLine = EMPTY_LINE,
  max = 5,
}: {
  items: SpaceHomeActionItem[];
  emptyLine?: string;
  max?: number;
}) {
  const shown = items.slice(0, max);
  if (shown.length === 0) {
    return (
      <section className={styles.section} aria-label="نیاز به اقدام">
        <p className={styles.calmEmpty}>{emptyLine}</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="space-home-actions-title">
      <h2 id="space-home-actions-title" className={styles.sectionTitle}>
        نیاز به اقدام
      </h2>
      <ul className={styles.list}>
        {shown.map((item) => (
          <li key={item.id} className={styles.listItem}>
            <div className={styles.listCopy}>
              <strong>{item.title}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
            <Link href={item.href} className={`dang-btn dang-btn--sm dang-btn--primary ${styles.listAction}`}>
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaceHomeActionsSlot({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>;
}
