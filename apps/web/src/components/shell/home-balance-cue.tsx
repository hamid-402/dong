"use client";

import type { SpaceKind } from "@dang/contracts";
import Link from "next/link";
import { displayUnitLabel } from "@dang/ui";
import { useDisplayUnit } from "@/lib/display-unit";
import { NAV_LABELS } from "@/lib/nav-labels";

/**
 * Single home balance strip — one amount, one status line, two actions max.
 * Replaces stacked HeroBalance + cue + quick-action cards on workspace home.
 */
export function HomeBalanceCue({
  amountLabel,
  balanceToman,
  openSettlements,
  postedCount,
  settleHref,
  expenseHref,
  spaceHref,
  spaceKind,
  persistenceHint,
}: {
  /** Preformatted display (supports animated parent). */
  amountLabel: string;
  balanceToman: number;
  openSettlements: number;
  postedCount?: number;
  settleHref: string;
  expenseHref: string;
  spaceHref: string;
  spaceKind: SpaceKind;
  persistenceHint?: string;
}) {
  const unitLabel = displayUnitLabel(useDisplayUnit());
  const owed = balanceToman > 0;
  const debt = balanceToman < 0;
  const needsSettle = debt || owed || openSettlements > 0;

  const label =
    spaceKind === "personal"
      ? "مانده خالص شما"
      : owed
        ? "در این فضا طلبکارید"
        : debt
          ? "در این فضا بدهکارید"
          : openSettlements > 0
            ? "تسویه باز دارید"
            : "حساب این فضا";

  const subtitleBits: string[] = [];
  if (postedCount != null) {
    subtitleBits.push(`${postedCount.toLocaleString("fa-IR")} خرج`);
  }
  if (openSettlements > 0) {
    subtitleBits.push(`${openSettlements.toLocaleString("fa-IR")} تسویه باز`);
  }
  if (persistenceHint) subtitleBits.push(persistenceHint);

  return (
    <aside className="homeBalanceCue" aria-label="مانده زنده این فضا">
      <div className="homeBalanceCue__copy">
        <p className="homeBalanceCue__label">{label}</p>
        <p
          className={`homeBalanceCue__amount${owed ? " is-credit" : debt ? " is-debt" : " is-settled"}`}
        >
          {amountLabel === "—"
            ? "—"
            : balanceToman === 0 && openSettlements > 0
              ? `${openSettlements.toLocaleString("fa-IR")} تسویه در جریان`
              : balanceToman === 0
                ? "تسویه"
                : `${owed ? "+" : "−"}${amountLabel} ${unitLabel}`}
        </p>
        {subtitleBits.length > 0 ? (
          <p className="homeBalanceCue__meta">{subtitleBits.join(" · ")}</p>
        ) : null}
      </div>
      <div className="homeBalanceCue__actions">
        {needsSettle ? (
          <Link href={settleHref} className="shell-v2__cta">
            {debt ? "شروع تسویه" : "مدیریت تسویه"}
          </Link>
        ) : null}
        <Link href={expenseHref} className={needsSettle ? "textButton" : "shell-v2__cta"}>
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
