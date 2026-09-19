"use client";

import Link from "next/link";
import { MarketingShell, useSiteStatus } from "@/components/site/marketing-shell";
import { SITE_SERVICE_ITEMS } from "@/lib/site-nav";

function ServicesBody() {
  const { trustBadges } = useSiteStatus();
  return (
    <div className="sitePage__inner">
      <header className="sitePage__head">
        <p className="siteHero__eyebrow">محصول</p>
        <h1>خدمات ما</h1>
        <p>
          دنگ همکاری مسیرهای عملیاتی مشترک را داخل فضای کاری فراهم می‌کند — هر
          قابلیت وقتی ماژول و پرچم محصول فعال باشد در اپ دیده می‌شود.
        </p>
      </header>
      <ol className="siteFeatureList">
        {SITE_SERVICE_ITEMS.map((item, index) => (
          <li key={item.title} className="siteFeature">
            <span className="siteFeature__index" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {trustBadges.length > 0 ? (
        <section className="siteSection" aria-labelledby="services-trust">
          <h2 id="services-trust">اعتماد محیط فعلی</h2>
          <p className="siteSection__lead">
            برچسب‌ها از وضعیت زندهٔ سرویس خوانده می‌شوند — نه متن ثابت.
          </p>
          <div className="authLayout__trustRow">
            {trustBadges.map((badge) => (
              <span key={badge} className="authLayout__trustBadge">
                {badge}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <div className="siteCtaBar">
        <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary">
          شروع با ثبت‌نام
        </Link>
        <Link href="/contact" className="authLayout__headerBtn">
          تماس با ما
        </Link>
      </div>
    </div>
  );
}

export default function ServicesClient() {
  return (
    <MarketingShell wide>
      <ServicesBody />
    </MarketingShell>
  );
}
