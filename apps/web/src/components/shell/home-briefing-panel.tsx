"use client";

import Link from "next/link";
import type { SpaceKind } from "@dang/contracts";
import {
  buildHomeBriefingActionsWithNotifyHref,
  buildHomeBriefingAlerts,
  homeBriefingHasWork,
  type HomeBriefingAction,
  type HomeBriefingAlert,
} from "@/lib/home-briefing";
import { Amount, displayUnitLabel } from "@dang/ui";
import { useDisplayUnit } from "@/lib/display-unit";
import { NAV_LABELS } from "@/lib/nav-labels";
import styles from "./home-briefing-panel.module.css";

export type { HomeBriefingAction, HomeBriefingAlert };

/**
 * Home briefing — balance + actionable queue + recent alerts.
 * All numbers/links must come from live dashboard / activity (no decorative work).
 */
export function HomeBriefingPanel({
  amountLabel,
  balanceToman,
  openSettlements,
  postedCount,
  pendingApprovals = 0,
  approvalSlaBreached = 0,
  openNeeds = 0,
  unreadNotifications = 0,
  settleHref,
  expenseHref,
  spaceHref,
  approvalsHref,
  needsHref,
  notificationsHref,
  spaceKind,
  persistenceHint,
  alerts = [],
  counterparty = null,
}: {
  amountLabel: string;
  balanceToman: number;
  openSettlements: number;
  postedCount?: number;
  pendingApprovals?: number;
  approvalSlaBreached?: number;
  openNeeds?: number;
  unreadNotifications?: number;
  settleHref: string;
  expenseHref: string;
  spaceHref: string;
  approvalsHref: string;
  needsHref: string;
  notificationsHref?: string;
  spaceKind: SpaceKind;
  persistenceHint?: string;
  alerts?: Array<{
    id: string;
    kind: "notification" | "audit";
    title: string;
    body?: string;
    href?: string;
    createdAt: string;
  }>;
  counterparty?: {
    direction: "debt" | "credit";
    name: string;
    amountMinor: string;
  } | null;
}) {
  const unitLabel = displayUnitLabel(useDisplayUnit());
  const owed = balanceToman > 0;
  const debt = balanceToman < 0;
  const needsSettle = debt || owed || openSettlements > 0;

  const balanceLabel =
    spaceKind === "personal"
      ? "مانده خالص شما"
      : owed
        ? "در این فضا طلبکارید"
        : debt
          ? "در این فضا بدهکارید"
          : openSettlements > 0
            ? "تسویه باز دارید"
            : "حساب این فضا";

  const metaBits: string[] = [];
  if (postedCount != null) {
    metaBits.push(`${postedCount.toLocaleString("fa-IR")} خرج ثبت‌شده`);
  }
  if (persistenceHint) metaBits.push(persistenceHint);

  const actions = buildHomeBriefingActionsWithNotifyHref({
    slug: "",
    pendingApprovals,
    approvalSlaBreached,
    openSettlements,
    openNeeds,
    unreadNotifications,
    approvalsHref,
    settlementsHref: settleHref,
    needsHref,
    notificationsHref,
  });
  const hasWork = homeBriefingHasWork(actions);
  const preview = buildHomeBriefingAlerts(alerts, 3);
  const overdueCount = actions.filter((a) => a.tone === "overdue").length;

  return (
    <aside
      id="home-briefing"
      className={`${styles.panel} homeBriefing`}
      aria-labelledby="home-briefing-title"
    >
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>
            {hasWork
              ? overdueCount > 0
                ? "کار عقب‌افتاده"
                : "نیازمند اقدام"
              : "وضعیت به‌روز"}
          </p>
          <h2 id="home-briefing-title" className={styles.title}>
            وضعیت، کارها و اعلان‌ها
          </h2>
        </div>
        {hasWork ? (
          <span className={styles.badge} data-tone={overdueCount > 0 ? "overdue" : "attention"}>
            {actions.reduce((n, a) => n + a.count, 0).toLocaleString("fa-IR")} مورد
          </span>
        ) : (
          <span className={styles.badge} data-tone="calm">
            بدون صف باز
          </span>
        )}
      </header>

      <div className={styles.balance}>
        <p className={styles.balanceLabel}>{balanceLabel}</p>
        <p
          className={styles.balanceAmount}
          data-tone={owed ? "credit" : debt ? "debt" : "settled"}
        >
          {amountLabel === "—"
            ? "—"
            : balanceToman === 0 && openSettlements > 0
              ? `${openSettlements.toLocaleString("fa-IR")} تسویه در جریان`
              : balanceToman === 0
                ? "تسویه"
                : `${owed ? "+" : "−"}${amountLabel} ${unitLabel}`}
        </p>
        {metaBits.length > 0 ? (
          <p className={styles.balanceMeta}>{metaBits.join(" · ")}</p>
        ) : null}
        {spaceKind !== "personal" && counterparty ? (
          <p className={styles.balanceMeta}>
            {counterparty.direction === "debt" ? "بیشترین بدهی‌ات" : "بیشترین طلبت"}{" "}
            <Amount irrMinor={counterparty.amountMinor} />
            {counterparty.direction === "debt" ? " به " : " از "}
            {counterparty.name}
          </p>
        ) : null}
      </div>

      {hasWork ? (
        <ul className={styles.queue} aria-label="کارهای باز">
          {actions.map((action) => (
            <li key={action.key}>
              <Link
                href={action.href}
                className={styles.queueItem}
                data-tone={action.tone}
              >
                <span className={styles.queueCount} aria-hidden>
                  {action.count > 9 ? "۹+" : action.count.toLocaleString("fa-IR")}
                </span>
                <span className={styles.queueCopy}>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </span>
                <span className={styles.queueGo} aria-hidden>
                  ←
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.clear}>
          تأیید، تسویه یا نیاز عقب‌افتاده‌ای از داشبورد زنده دیده نمی‌شود.
        </p>
      )}

      {preview.length > 0 ? (
        <section className={styles.alerts} aria-label="اعلان و فعالیت اخیر">
          <h3 className={styles.alertsTitle}>تازه‌ترین سیگنال‌ها</h3>
          <ul className={styles.alertsList}>
            {preview.map((alert) => {
              const inner = (
                <>
                  <strong>{alert.title}</strong>
                  <small>
                    {alert.kind === "notification" ? "اعلان" : "ممیزی"}
                    {alert.detail ? ` · ${alert.detail}` : ""}
                  </small>
                </>
              );
              return (
                <li key={alert.id}>
                  {alert.href ? (
                    <Link href={alert.href} className={styles.alertLink}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={styles.alertLink}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className={styles.cta}>
        {needsSettle ? (
          <Link href={settleHref} className="shell-v2__cta">
            {debt ? "شروع تسویه" : "مدیریت تسویه"}
          </Link>
        ) : null}
        <Link
          href={expenseHref}
          className={needsSettle ? "textButton" : "shell-v2__cta"}
        >
          {spaceKind === "personal" ? "ثبت در دفتر من" : NAV_LABELS.addExpense}
        </Link>
        {spaceKind !== "personal" ? (
          <Link href={spaceHref} className="textButton">
            صفحهٔ فضا
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
