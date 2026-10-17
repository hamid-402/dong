"use client";

import Link from "next/link";
import type { OutingSummary } from "@dang/contracts";
import styles from "./space-home.module.css";

/**
 * Compact collapsible list of multi-expense outings for the expenses section.
 * Hidden by the caller when there is no data.
 */
export function SpaceHomeOutingCard({
  outings,
  expensesHref,
  spaceHref,
}: {
  outings: Array<Pick<OutingSummary, "id" | "title" | "expenseIds">>;
  expensesHref: string;
  spaceHref?: string | null;
}) {
  if (outings.length === 0) return null;

  return (
    <details className={styles.collapsedExtra} open={false}>
      <summary>
        گردش چندخرجی ({outings.length.toLocaleString("fa-IR")})
      </summary>
      <div className={styles.outingBody}>
        <ul className={styles.outingList}>
          {outings.map((row) => (
            <li key={row.id}>
              <Link
                href={`${expensesHref}?outing=${encodeURIComponent(row.id)}#quick-expense`}
              >
                {row.title} ({row.expenseIds.length.toLocaleString("fa-IR")})
              </Link>
            </li>
          ))}
        </ul>
        {spaceHref ? (
          <p className={styles.outingMeta}>
            <Link href={spaceHref} className={styles.destLink}>
              مدیریت و ساخت گردش در صفحهٔ فضا
            </Link>
          </p>
        ) : null}
      </div>
    </details>
  );
}
