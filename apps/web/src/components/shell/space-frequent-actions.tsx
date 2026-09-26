"use client";

import Link from "next/link";
import { useViewportMode } from "@/lib/use-viewport";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import styles from "./space-frequent-actions.module.css";

type ActionItem = {
  key: string;
  href: string;
  label: string;
  hint?: string;
  primary?: boolean;
  count?: number;
};

/**
 * High-frequency jumps for kind space home (`/w/…/space`).
 * Desktop: compact strip (sidebar owns full nav). Mobile: larger touch targets.
 */
export function SpaceFrequentActions({
  slug,
  openSettlements = 0,
  memberCount,
  canAddExpense = true,
  inviteHref,
  addMemberHref,
  showInvite = true,
  showAddMember = false,
  showSettlements = true,
  showMembers = true,
  showSettings = true,
  approvalsHref,
  showApprovals = false,
  approvalCount,
}: {
  slug: string;
  openSettlements?: number;
  memberCount?: number;
  canAddExpense?: boolean;
  /** Prefer join/invite deep-link when available. */
  inviteHref?: string;
  addMemberHref?: string;
  showInvite?: boolean;
  showAddMember?: boolean;
  showSettlements?: boolean;
  showMembers?: boolean;
  showSettings?: boolean;
  approvalsHref?: string;
  showApprovals?: boolean;
  approvalCount?: number;
}) {
  const viewport = useViewportMode();
  const mobile = viewport !== "desktop";

  const items: ActionItem[] = [];
  if (showApprovals && approvalsHref) {
    items.push({
      key: "approvals",
      href: approvalsHref,
      label: NAV_LABELS.approvals,
      hint: "صف تأیید",
      primary: true,
      count: approvalCount && approvalCount > 0 ? approvalCount : undefined,
    });
  }
  if (canAddExpense) {
    items.push({
      key: "expense",
      href: `${wPath(slug, "expenses")}#quick-expense`,
      label: NAV_LABELS.addExpense,
      hint: "ثبت سریع",
      primary: !showApprovals,
    });
  }
  items.push({
    key: "expenses-hub",
    href: wPath(slug, "expenses"),
    label: NAV_LABELS.expenses,
    hint: "فهرست، فیلتر، برگشت",
    primary: !canAddExpense && !showApprovals,
  });
  if (showSettlements) {
    items.push({
      key: "settlements",
      href: wPath(slug, "settlements"),
      label: NAV_LABELS.settlements,
      hint: openSettlements > 0 ? "نیاز به اقدام" : "وضعیت حساب",
      count: openSettlements > 0 ? openSettlements : undefined,
      primary: openSettlements > 0 && !showApprovals,
    });
  }
  if (showMembers) {
    items.push({
      key: "members",
      href: wPath(slug, "members"),
      label: NAV_LABELS.members,
      hint:
        memberCount != null
          ? `${memberCount.toLocaleString("fa-IR")} نفر`
          : "نقش و دعوت",
      count: memberCount,
    });
  }
  if (showAddMember) {
    items.push({
      key: "add-member",
      href: addMemberHref ?? `${wPath(slug, "members")}#member-add-panel`,
      label: "افزودن عضو",
      hint: "با نام‌کاربری / شناسه",
    });
  }
  if (showInvite) {
    items.push({
      key: "invite",
      href: inviteHref ?? `${wPath(slug, "members")}#invite-create-panel`,
      label: "دعوت",
      hint: "لینک دعوت",
    });
  }
  if (showSettings) {
    items.push({
      key: "settings",
      href: `${wPath(slug, "settings")}#danger`,
      label: NAV_LABELS.settings,
      hint: "مشخصات، ترک عضویت و بایگانی",
    });
  }

  return (
    <nav
      className={`${styles.rail}${mobile ? ` ${styles.mobile}` : ` ${styles.desktop}`}`}
      aria-label="اقدام‌های پرتکرار"
    >
      <header className={styles.head}>
        <h2 className={styles.title}>اقدام‌های پرتکرار</h2>
        <p className={styles.lead}>
          {mobile
            ? `ثبت سریع یا «${NAV_LABELS.expenses}» برای مدیریت کامل — بقیه از منو.`
            : `«${NAV_LABELS.expenses}» مرکز مدیریت است؛ ثبت سریع هم اینجاست.`}
        </p>
      </header>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={`${styles.item}${item.primary ? ` ${styles.itemPrimary}` : ""}`}
            >
              <span className={styles.itemLabel}>
                {item.label}
                {item.count != null && item.count > 0 ? (
                  <span className={styles.badge}>{item.count.toLocaleString("fa-IR")}</span>
                ) : null}
              </span>
              {item.hint ? <small className={styles.hint}>{item.hint}</small> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
