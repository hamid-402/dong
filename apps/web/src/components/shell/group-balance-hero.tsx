"use client";

import Link from "next/link";
import { Amount, displayUnitLabel, formatMoneyFromIrrMinor, irrMinorToDisplayInteger } from "@dang/ui";
import { useDisplayUnit } from "@/lib/display-unit";
import { NAV_LABELS } from "@/lib/nav-labels";
import { netBalancePhrase } from "@/lib/net-amount-display";
import { netFromIrrMinor, sortPeersByAbsNet } from "@/lib/space-net-balance";

type PeerLine = {
  userId: string;
  name: string;
  amountMinor: string;
};

type RecentExpense = {
  id: string;
  title: string;
  /** IRR minor (preferred) or legacy toman integer when irrMinor omitted. */
  toman: number;
  irrMinor?: string | number;
  status: string;
};

/**
 * Professional group balance hero (Splitwise / Dongino pattern):
 * your net, peer snapshot, recent activity, clear settle / expense CTAs.
 */
export function GroupBalanceHero({
  workspaceName,
  myNetMinor,
  peers,
  settleHref,
  expenseHref,
  recordHref,
  simplifyHref,
  simplifyAvailable,
  openSettlements,
  recentExpenses = [],
  canMutate = true,
}: {
  workspaceName?: string;
  myNetMinor: string | null;
  peers: PeerLine[];
  settleHref: string;
  /** Expenses list / inspector deep-links. */
  expenseHref: string;
  /** Money entry chooser (clarity). Falls back to expenseHref. */
  recordHref?: string;
  simplifyHref?: string;
  simplifyAvailable?: boolean;
  openSettlements?: number;
  recentExpenses?: RecentExpense[];
  /** Guest/auditor: hide write CTAs; keep view links. */
  canMutate?: boolean;
}) {
  const unit = useDisplayUnit();
  const unitLabel = displayUnitLabel(unit);
  if (myNetMinor == null) return null;
  const mine = netFromIrrMinor(myNetMinor, unit);
  const topPeers = sortPeersByAbsNet(peers, unit).slice(0, 5);
  const open = openSettlements ?? 0;
  const absDisplay = formatMoneyFromIrrMinor(Math.abs(mine.irrMinor), unit);
  const expensesBase = expenseHref.split("#")[0] ?? expenseHref;
  void recordHref;

  return (
    <section className="groupBalanceHero" aria-labelledby="group-balance-hero-title">
      <div className="groupBalanceHero__main">
        <p className="groupBalanceHero__eyebrow">
          مانده شما{workspaceName ? ` در «${workspaceName}»` : " در این گروه"}
        </p>
        <h2 id="group-balance-hero-title" className={`groupBalanceHero__net is-${mine.tone}`}>
          {mine.tone === "settled"
            ? "حساب‌ها تسویه است"
            : `${netBalancePhrase(mine.tone)} ${absDisplay} ${unitLabel}`}
        </h2>
        <p className="groupBalanceHero__hint">
          {mine.tone === "credit"
            ? "از تسویه برای دریافت سهم استفاده کنید."
            : mine.tone === "debt"
              ? "با تسویه حساب یا پیشنهاد کمینه، پرداخت را کوتاه کنید."
              : `با ${NAV_LABELS.addExpense} تازه، مانده از دفتر زنده دوباره محاسبه می‌شود.`}
        </p>
        {open > 0 ? (
          <p className="groupBalanceHero__badge" role="status">
            {open.toLocaleString("fa-IR")} تسویه باز در این فضا
          </p>
        ) : null}
        <p className="groupBalanceHero__hint">
          {mine.tone !== "settled" || open > 0 ? (
            <Link href={settleHref}>تسویه</Link>
          ) : null}
          {canMutate && simplifyAvailable && simplifyHref && mine.tone !== "settled" ? (
            <>
              {" · "}
              <Link href={simplifyHref}>تسویهٔ کمینه</Link>
            </>
          ) : null}
          {!canMutate ? (
            <>
              {" · "}
              <Link href={expensesBase}>مشاهدهٔ {NAV_LABELS.expenses}</Link>
            </>
          ) : null}
        </p>
      </div>

      <div className="groupBalanceHero__side">
        {topPeers.length > 0 ? (
          <ul className="groupBalanceHero__peers" aria-label="مانده اعضا">
            {topPeers.map((p) => {
              const settleDisplay = irrMinorToDisplayInteger(
                Math.abs(p.net.irrMinor),
                unit,
              ).toString();
              const href = `${settleHref}${settleHref.includes("?") ? "&" : "?"}settleTo=${encodeURIComponent(p.userId)}&settleAmount=${settleDisplay}#settlement-panel`;
              return (
                <li key={p.userId}>
                  <Link href={href} className="groupBalanceHero__peerLink">
                    <b>{p.name}</b>
                    <span className={`is-${p.net.tone}`}>{p.net.label}</span>
                    <small>تسویه</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="liveHint">هنوز ماندهٔ بازی با عضو دیگری نیست.</p>
        )}

        {recentExpenses.length > 0 ? (
          <div className="groupBalanceHero__activity">
            <p className="groupBalanceHero__activityTitle">آخرین خرج</p>
            <ul>
              {recentExpenses.slice(0, 1).map((e) => {
                const minor =
                  e.irrMinor != null
                    ? e.irrMinor
                    : String(Math.round(e.toman) * 10);
                return (
                  <li key={e.id}>
                    <Link
                      href={`${expensesBase}${expensesBase.includes("?") ? "&" : "?"}expense=${encodeURIComponent(e.id)}`}
                      className="groupBalanceHero__expenseLink"
                    >
                      <span>{e.title}</span>
                      <strong>
                        <Amount irrMinor={minor} />
                      </strong>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href={expensesBase} className="textButton">
              همهٔ {NAV_LABELS.expenses}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
