"use client";

import Link from "next/link";
import { MarketingShell, useSiteStatus } from "@/components/site/marketing-shell";
import { SiteContactForm } from "@/components/site/site-contact-form";

export default function ContactClient() {
  return (
    <MarketingShell wide>
      <div className="sitePage__inner">
        <header className="sitePage__head">
          <p className="siteHero__eyebrow">پشتیبانی</p>
          <h1>تماس با ما</h1>
          <p>
            فرم زیر از طریق API ثبت می‌شود. ایمیل مستقیم فقط وقتی صندوق پشتیبانی در
            capabilities پیکربندی شده باشد نشان داده می‌شود — بدون آدرس جعلی.
          </p>
        </header>
        <div className="siteContactLayout">
          <SiteContactForm />
          <ContactAside />
        </div>
      </div>
    </MarketingShell>
  );
}

function ContactAside() {
  const { caps } = useSiteStatus();
  const inbox = caps?.supportContactEmail?.trim() || null;
  return (
    <aside className="siteCard siteCard--aside">
      <h2>راه‌های دیگر</h2>
      <ul className="sitePlainList">
        {inbox ? (
          <li>
            <a href={`mailto:${inbox}`}>{inbox}</a>
          </li>
        ) : null}
        <li>
          <Link href="/login">ورود به حساب</Link>
        </li>
        <li>
          <Link href="/register">ثبت‌نام</Link>
        </li>
        <li>
          <Link href="/services">خدمات ما</Link>
        </li>
      </ul>
    </aside>
  );
}
