"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatToman } from "@dang/ui";
import { api } from "@/lib/api";
import { hubPathFor } from "@/lib/hub-links";
import { useAppChrome } from "@/lib/use-app-chrome";

type Tone = "neutral" | "credit" | "debt";

/** Primary financial summary — uses active workspace from chrome. */
export function MosaicHeroArt() {
  const { workspaceId, workspaceName, ready } = useAppChrome();
  const [amount, setAmount] = useState<string>("—");
  const [subtitle, setSubtitle] = useState("در حال همگام‌سازی…");
  const [tone, setTone] = useState<Tone>("neutral");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!workspaceId) {
      setAmount(formatToman(0));
      setSubtitle("فضای کاری بسازید یا دادهٔ نمونه را بارگذاری کنید");
      setTone("neutral");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [session, balances] = await Promise.all([
          api.session(),
          api.getBalances(workspaceId),
        ]);
        const actor = session.actor;
        if (!actor) {
          if (!cancelled) {
            setAmount(formatToman(0));
            setSubtitle("هویت کاربر مشخص نیست");
            setTone("neutral");
            setLoading(false);
          }
          return;
        }
        const line = balances.lines.find((b) => b.userId === actor.userId);
        const net = Number(line?.net.amountMinor ?? "0");
        const toman = Math.round(net / 10);
        if (!cancelled) {
          setAmount(formatToman(Math.abs(toman)));
          setSubtitle(toman >= 0 ? "طلب خالص شما · تومان" : "بدهی خالص شما · تومان");
          setTone(toman > 0 ? "credit" : toman < 0 ? "debt" : "neutral");
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAmount("—");
          setSubtitle("اتصال برقرار نیست");
          setTone("neutral");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, workspaceId]);

  return (
    <Link
      href={hubPathFor("/workspaces")}
      className={`mosaic-balance-card mosaic-balance-card--${tone}${loading ? " is-loading" : ""}`}
      aria-busy={loading}
      aria-label="مشاهده جزئیات مالی"
    >
      <div className="mosaic-balance-card__glow" aria-hidden />
      <div className="mosaic-balance-card__top">
        <span>مانده دفترکل</span>
        <span className="mosaic-balance-card__ws">{workspaceName || "دنگ همکاری"}</span>
      </div>
      <strong className="mosaic-balance-card__amount">{amount}</strong>
      <p className="mosaic-balance-card__sub">{subtitle}</p>
      <span className="mosaic-balance-card__cta">جزئیات مالی ‹</span>
    </Link>
  );
}
