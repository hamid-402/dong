"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./space-home.module.css";

export type SpaceHomeActivityItem = {
  id: string;
  title: string;
  detail?: string;
  href?: string;
};

/**
 * Last few activity rows — reuses feed / recent expense data from the parent.
 */
export function SpaceHomeActivity({
  items,
  emptyLine = "هنوز رویدادی نیست — با اولین ثبت اینجا پر می‌شود.",
  max = 5,
}: {
  items: SpaceHomeActivityItem[];
  emptyLine?: string;
  max?: number;
}) {
  const shown = items.slice(0, max);

  return (
    <section className={styles.section} aria-labelledby="space-home-activity-title">
      <h2 id="space-home-activity-title" className={styles.sectionTitle}>
        آخرین فعالیت‌ها
      </h2>
      {shown.length === 0 ? (
        <p className={styles.calmEmpty}>{emptyLine}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((item) => {
            const body: ReactNode = (
              <div className={styles.listCopy}>
                <strong>{item.title}</strong>
                {item.detail ? <small>{item.detail}</small> : null}
              </div>
            );
            return (
              <li key={item.id} className={styles.listItem}>
                {item.href ? (
                  <Link href={item.href} className={styles.listCopy} style={{ textDecoration: "none" }}>
                    <strong>{item.title}</strong>
                    {item.detail ? <small>{item.detail}</small> : null}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
