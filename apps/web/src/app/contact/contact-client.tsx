"use client";

import Link from "next/link";
import { MarketingShell } from "@/components/site/marketing-shell";
import { SiteContactForm } from "@/components/site/site-contact-form";

export default function ContactClient() {
  return (
    <MarketingShell wide>
      <div className="sitePage__inner">
        <header className="sitePage__head">
          <p className="siteHero__eyebrow">پشتیبانی</p>
          <h1>تماس با ما</h1>
          <p>
            فرم زیر پیام را در برنامهٔ ایمیل شما آماده می‌کند. هیچ تأیید جعلی «پیام
            دریافت شد» نشان داده نمی‌شود مگر اینکه واقعاً ایمیل باز شود.
          </p>
        </header>
        <div className="siteContactLayout">
          <SiteContactForm />
          <aside className="siteCard siteCard--aside">
            <h2>راه‌های دیگر</h2>
            <ul className="sitePlainList">
              <li>
                <a href="mailto:support@dang.local">support@dang.local</a>
              </li>
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
        </div>
      </div>
    </MarketingShell>
  );
}
