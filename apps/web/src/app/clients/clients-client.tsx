"use client";

import Link from "next/link";
import { MarketingShell } from "@/components/site/marketing-shell";
import { SITE_CLIENT_SCENARIOS } from "@/lib/site-nav";

export default function ClientsClient() {
  return (
    <MarketingShell wide>
      <div className="sitePage__inner">
        <header className="sitePage__head">
          <p className="siteHero__eyebrow">موارد استفاده</p>
          <h1>مشتریان ما</h1>
          <p>
            فهرست عمومی لوگو یا آمار مشتری منتشر نشده است. آنچه می‌بینید سناریوهای
            واقعی قالب‌های محصول است — شخصی، گروه و تیم — بدون عدد نمایشی.
          </p>
        </header>
        <ul className="siteCardGrid siteCardGrid--lg">
          {SITE_CLIENT_SCENARIOS.map((item) => (
            <li key={item.title} className="siteCard siteCard--lift">
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <Link href="/register" className="siteCard__link">
                ساخت فضای مشابه
              </Link>
            </li>
          ))}
        </ul>
        <div className="siteCtaBar">
          <Link href="/about" className="authLayout__headerBtn">
            درباره ما
          </Link>
          <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary">
            شروع کنید
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
