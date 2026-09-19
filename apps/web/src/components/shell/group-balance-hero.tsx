"use client";

import Link from "next/link";
import { formatToman } from "@dang/ui";
import { netFromIrrMinor, sortPeersByAbsNet } from "@/lib/space-net-balance";

type PeerLine = {
  userId: string;
  name: string;
  amountMinor: string;
};

type RecentExpense = {
  id: string;
  title: string;
  toman: number;
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
  simplifyHref,
  simplifyAvailable,
  openSettlements,
  recentExpenses = [],
}: {
  workspaceName?: string;
  myNetMinor: string | null;
  peers: PeerLine[];
  settleHref: string;
  expenseHref: string;
  simplifyHref?: string;
  simplifyAvailable?: boolean;
  openSettlements?: number;
  recentExpenses?: RecentExpense[];
}) {
  if (myNetMinor == null) return null;
  const mine = netFromIrrMinor(myNetMinor);
  const topPeers = sortPeersByAbsNet(peers).slice(0, 5);
  const open = openSettlements ?? 0;

  return (
    <section className="groupBalanceHero" aria-labelledby="group-balance-hero-title">
      <div className="groupBalanceHero__main">
        <p className="groupBalanceHero__eyebrow">
          مانده شما{workspaceName ? ` در «${workspaceName}»` : " در این گروه"}
        </p>
        <h2 id="group-balance-hero-title" className={`groupBalanceHero__net is-${mine.tone}`}>
          {mine.tone === "settled"
            ? "حساب‌ها تسویه است"
            : mine.tone === "credit"
              ? `+${formatToman(mine.toman)} تومان`
              : `−${formatToman(Math.abs(mine.toman))} تومان`}
        </h2>
        <p className="groupBalanceHero__hint">
          {mine.tone === "credit"
            ? "طلبکارید — از تسویه برای دریافت سهم استفاده کنید."
            : mine.tone === "debt"
              ? "بدهکارید — با تسویه حساب یا پیشنهاد کمینه، پرداخت را کوتاه کنید."
              : "با ثبت خرج تازه، مانده از دفتر زنده دوباره محاسبه می‌شود."}
        </p>
        {open > 0 ? (
          <p className="groupBalanceHero__badge" role="status">
            {open.toLocaleString("fa-IR")} تسویه باز در این فضا
          </p>
        ) : null}
        <div className="groupBalanceHero__actions">
          {mine.tone !== "settled" || open > 0 ? (
            <Link href={settleHref} className="shell-v2__cta">
              {mine.tone === "debt" ? "شروع تسویه" : "مدیریت تسویه"}
            </Link>
          ) : null}
          <Link href={expenseHref} className="authLayout__headerBtn">
            ثبت خرج
          </Link>
          {simplifyAvailable && simplifyHref && mine.tone !== "settled" ? (
            <Link href={simplifyHref} className="siteHero__textLink">
              تسویهٔ کمینه
            </Link>
          ) : null}
        </div>
      </div>

      <div className="groupBalanceHero__side">
        {topPeers.length > 0 ? (
          <ul className="groupBalanceHero__peers" aria-label="مانده اعضا">
            {topPeers.map((p) => {
              const toman = Math.abs(p.net.toman);
              const href = `${settleHref}${settleHref.includes("?") ? "&" : "?"}settleTo=${encodeURIComponent(p.userId)}&settleAmount=${toman}#settlement-panel`;
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
            <p className="groupBalanceHero__activityTitle">آخرین خرج‌ها</p>
            <ul>
              {recentExpenses.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <Link
                    href={`${expenseHref}${expenseHref.includes("?") ? "&" : "?"}expense=${encodeURIComponent(e.id)}#expense-inspector`}
                    className="groupBalanceHero__expenseLink"
                  >
                    <span>{e.title}</span>
                    <strong>{formatToman(e.toman)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={expenseHref} className="textButton">
              همهٔ خرج‌ها
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
