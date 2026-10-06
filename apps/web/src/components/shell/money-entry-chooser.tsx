"use client";

import Link from "next/link";
import { isReadOnlyRole, spaceKindForTemplate } from "@dang/contracts";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import styles from "@/components/shell/money-entry-chooser.module.css";

/**
 * Compact job chooser: daily entry vs full expense (additive clarity).
 * Does not replace /record hub — used on space home as the primary register CTA.
 */
export function MoneyEntryChooser({
  slug,
  compact = false,
  /** Optional deep-link for building/org unit charge (additive). */
  expenseHrefForUnit,
}: {
  slug: string;
  compact?: boolean;
  expenseHrefForUnit?: string | null;
}) {
  const chrome = useAppChrome();
  const { role } = useWorkspaceMembershipRole(chrome.workspaceId);
  const ws = chrome.workspaces.find((w) => w.slug === slug);
  const kind = spaceKindForTemplate(ws?.template);
  const showLedger = kind !== "personal";
  const readOnly = isReadOnlyRole(role);

  if (readOnly) return null;

  const fullHref =
    expenseHrefForUnit?.trim() ||
    `${wPath(slug, "expenses")}#quick-expense`;
  const fullHint =
    kind === "building" || kind === "org"
      ? expenseHrefForUnit
        ? "شارژ واحد · تقسیم و جزئیات"
        : "تقسیم، جزئیات و شارژ"
      : "تقسیم، جزئیات و رویدادها";

  return (
    <section
      className={`${styles.chooser}${compact ? ` ${styles.compact}` : ""}`}
      aria-label="نحوهٔ ثبت پول"
    >
      {!compact ? (
        <header className={styles.head}>
          <h2 className={styles.title}>امروز چطور ثبت می‌کنی؟</h2>
          <p className={styles.hint}>
            هر دو در مانده و فهرست خرج می‌آیند — ویرایش هر کدام از مسیر خودش.
          </p>
        </header>
      ) : null}
      <ul className={styles.grid}>
        {showLedger ? (
          <li>
            <Link className={styles.card} href={wPath(slug, "ledger")}>
              <strong>{NAV_LABELS.dailyEntry}</strong>
              <span>تیک روز×عضو برای مصرف تکراری</span>
            </Link>
          </li>
        ) : null}
        <li>
          <Link className={styles.card} href={fullHref}>
            <strong>{NAV_LABELS.fullExpense}</strong>
            <span>{fullHint}</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
