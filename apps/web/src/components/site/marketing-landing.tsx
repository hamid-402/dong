"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketingShell, useSiteStatus } from "@/components/site/marketing-shell";
import { SITE_CLIENT_SCENARIOS, SITE_SERVICE_ITEMS } from "@/lib/site-nav";
import { api } from "@/lib/api";
import { StickerSvg } from "@/components/visual/stickers";

const HOW_STEPS = [
  {
    title: "فضا بسازید",
    body: "شخصی، گروه دوستان، یا تیم کوچک — قالب همان روز اول مسیر را مشخص می‌کند.",
  },
  {
    title: "خرج و خرید را ثبت کنید",
    body: "با دکمهٔ ثبت سریع یا خانهٔ فضا؛ سهم‌ها و مانده از همان دادهٔ زنده ساخته می‌شوند.",
  },
  {
    title: "تسویه و گزارش",
    body: "ادعا، تأیید، صورتحساب دوره و گزارش — بدون جدول اکسل موازی.",
  },
] as const;

const FAQ_ITEMS = [
  {
    q: "آیا دنگ جای حسابداری قانونی است؟",
    a: "خیر. دنگ دفتر عملیات مشترک قبل از حسابداری است: خرج، خرید، تجهیزات و تسویه را شفاف نگه می‌دارد تا بعداً به حسابدار یا سیستم قانونی منتقل کنید.",
  },
  {
    q: "پول اعضا در دنگ نگه داشته می‌شود؟",
    a: "در نسخهٔ فعلی نگهداری وجوه کاربران هدف محصول نیست. تمرکز روی ثبت مشترک، تأیید و تسویهٔ شفاف است.",
  },
  {
    q: "چطور بفهمم سرویس واقعی است نه نمایشی؟",
    a: "وضعیت و برچسب‌های اعتماد از /health/ready و /system/capabilities می‌آیند؛ اگر دیتابیس یا درگاه stub باشد، صریحاً گفته می‌شود.",
  },
  {
    q: "بعد از ثبت‌نام کجا می‌روم؟",
    a: "به ساخت یا انتخاب فضای کاری، سپس خانهٔ همان فضا — جدا از صفحات معرفی سایت مثل خدمات و تماس.",
  },
] as const;

function SessionContinueBanner() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .session()
      .then(() => {
        if (!cancelled) setHasSession(true);
      })
      .catch(() => {
        if (!cancelled) setHasSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasSession) return null;

  return (
    <p className="siteSessionBanner" role="status">
      نشست شما فعال است.{" "}
      <Link href="/home">ادامه در فضاهای کاری</Link>
    </p>
  );
}

/**
 * Public marketing home — slogan, promise, path, audience.
 * First viewport: brand, one tagline, one short lead, CTA group, dominant visual.
 * Status, trust, how-it-works, FAQ, and grids stay below the fold (not removed).
 * No invented metrics or customer logos; trust from live capabilities only.
 */
export function MarketingLanding() {
  const { trustBadges, statusLabel, offline } = useSiteStatus();

  return (
    <div className="siteLanding">
      <SessionContinueBanner />

      <section className="siteHero siteHero--home" aria-labelledby="site-hero-brand">
        <div className="siteHero__plane" aria-hidden>
          <div className="siteHero__glow" />
          <StickerSvg name="handshake" className="siteHero__sticker siteHero__sticker--home" />
        </div>
        <div className="siteHero__copy siteHero__copy--home">
          <h1 id="site-hero-brand" className="siteHero__brand">
            دنگ همکاری
          </h1>
          <p className="siteHero__tagline">
            هزینه، خرید و شرکا را در یک جا شفاف نگه دارید
          </p>
          <p className="siteHero__lead">
            ثبت خرج، تأیید خرید و تسویه — با ماندهٔ زنده، نه آمار نمایشی.
          </p>
          <div className="siteHero__actions">
            <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary">
              شروع رایگان
            </Link>
            <Link href="/services" className="authLayout__headerBtn">
              مشاهده خدمات
            </Link>
            <Link href="/login" className="siteHero__textLink">
              ورود به فضای کاری
            </Link>
          </div>
        </div>
      </section>

      <section
        className="siteSection siteSection--trust"
        aria-labelledby="site-trust-title"
      >
        <div className="siteSection__head">
          <p className="siteHero__eyebrow" id="site-trust-title">
            دفتر عملیات مشترک
          </p>
          <p className="siteSection__lead">
            برای گروه‌های کوچک تا تیم‌های عملیاتی: ثبت خرج، تأیید خرید، تجهیزات و
            تسویه — با ماندهٔ واقعی از API، نه آمار نمایشی.
          </p>
          <p className="siteHero__status" aria-live="polite">
            وضعیت سرویس:{" "}
            <strong className={offline ? "warn" : undefined}>{statusLabel}</strong>
          </p>
        </div>
        {trustBadges.length > 0 ? (
          <div className="authLayout__trustRow siteHero__trust" aria-label="قابلیت‌های واقعی محیط">
            {trustBadges.map((badge) => (
              <span key={badge} className="authLayout__trustBadge">
                {badge}
              </span>
            ))}
          </div>
        ) : (
          <p className="siteHero__trustHint liveHint">
            برچسب‌های اعتماد پس از پاسخ capabilities نمایش داده می‌شوند.
          </p>
        )}
      </section>

      <section className="siteSection siteSection--problem" aria-labelledby="site-problem-title">
        <div className="siteSection__head">
          <h2 id="site-problem-title">چرا اکسل و چت کافی نیست؟</h2>
          <p className="siteSection__lead">
            سهم‌ها در پیام‌ها گم می‌شود، رسیدها پخش می‌شود، و هیچ‌کس نمی‌داند
            ماندهٔ واقعی چیست. دنگ همان جریان را داخل یک فضای کاری جمع می‌کند.
          </p>
        </div>
        <ul className="sitePromiseList">
          <li>
            <strong>یک منبع حقیقت</strong>
            <span>خرج و تسویه از همان دفتر زنده می‌آید.</span>
          </li>
          <li>
            <strong>مسیر قابل پیگیری</strong>
            <span>از نیاز خرید تا تحویل و تأیید، مرحله‌به‌مرحله.</span>
          </li>
          <li>
            <strong>صداقت فنی</strong>
            <span>اگر سرویس stub باشد، در capabilities و UI پنهان نمی‌ماند.</span>
          </li>
        </ul>
      </section>

      <section className="siteSection" aria-labelledby="site-simplify-title">
        <div className="siteSection__head">
          <h2 id="site-simplify-title">بدهی‌های درهم؛ تسویهٔ کمینه</h2>
          <p className="siteSection__lead">
            وقتی چند نفر به هم بدهکارند، تعداد پرداخت‌های متقابل بالا می‌رود. دنگ
            مسیر تسویه را کوتاه می‌کند — فقط وقتی قابلیت در capabilities فعال باشد،
            و بدون عددهای تبلیغاتی جعلی.
          </p>
        </div>
        <ol className="siteSimplifySteps">
          <li>
            <strong>مانده زنده</strong>
            <span>هر عضو از دفتر همان فضا می‌بیند چقدر بدهکار یا طلبکار است.</span>
          </li>
          <li>
            <strong>پیشنهاد کمینه</strong>
            <span>الگوریتم، مجموعهٔ پرداخت‌های لازم را پیشنهاد می‌دهد (پرچم محصول).</span>
          </li>
          <li>
            <strong>تأیید واقعی</strong>
            <span>ادعا و تأیید تسویه در API ثبت می‌شود — نه فقط روی بنر معرفی.</span>
          </li>
        </ol>
        <div className="siteSimplifyCompare" role="group" aria-label="قبل و بعد مفهومی">
          <div>
            <p className="siteSimplifyCompare__label">قبل</p>
            <p>چند بدهی دوطرفه بین اعضا — سخت برای پیگیری در چت و اکسل.</p>
          </div>
          <div>
            <p className="siteSimplifyCompare__label">بعد</p>
            <p>چند پرداخت هدفمند؛ تأیید از مسیر تسویهٔ فضای کاری.</p>
          </div>
        </div>
      </section>

      <section className="siteSection" aria-labelledby="site-how-title">
        <div className="siteSection__head">
          <h2 id="site-how-title">چطور شروع می‌شود؟</h2>
          <p className="siteSection__lead">سه قدم تا خانهٔ فضای کاری — بدون تور جعلی.</p>
        </div>
        <ol className="siteStepList">
          {HOW_STEPS.map((step, index) => (
            <li key={step.title} className="siteStep">
              <span className="siteStep__index" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="siteSection" aria-labelledby="site-services-title">
        <div className="siteSection__head">
          <h2 id="site-services-title">چه کارهایی را پوشش می‌دهد؟</h2>
          <p className="siteSection__lead">
            بعد از ورود، همین مسیرها داخل خانهٔ فضا باز می‌شوند — نه فقط روی سایت معرفی.
          </p>
        </div>
        <ol className="siteFeatureList">
          {SITE_SERVICE_ITEMS.map((item, index) => (
            <li key={item.title} className="siteFeature">
              <span className="siteFeature__index" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="siteSection__more">
          <Link href="/services">جزئیات خدمات</Link>
        </p>
      </section>

      <section className="siteSection" aria-labelledby="site-clients-title">
        <div className="siteSection__head">
          <h2 id="site-clients-title">برای چه کسانی ساخته شده؟</h2>
          <p className="siteSection__lead">
            سناریوهای قالب محصول — بدون لوگوی جعلی مشتری یا آمار ساختگی.
          </p>
        </div>
        <ul className="siteAudience">
          {SITE_CLIENT_SCENARIOS.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="siteSection__more">
          <Link href="/clients">موارد استفاده</Link>
        </p>
      </section>

      <section className="siteSection" aria-labelledby="site-faq-title">
        <div className="siteSection__head">
          <h2 id="site-faq-title">سوال‌های رایج</h2>
        </div>
        <div className="siteFaq">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="siteFaq__item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="siteSection siteSection--cta" aria-labelledby="site-cta-title">
        <h2 id="site-cta-title">از معرفی تا اتاق عملیات</h2>
        <p>
          ثبت‌نام کنید، فضا بسازید، و کار روزمره را از خانهٔ همان فضا ادامه دهید —
          سایت برای معرفی است؛ اپ برای اجرا.
        </p>
        <div className="siteHero__actions">
          <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary">
            شروع رایگان
          </Link>
          <Link href="/about" className="authLayout__headerBtn">
            درباره ما
          </Link>
          <Link href="/contact" className="authLayout__headerBtn">
            تماس با ما
          </Link>
        </div>
      </section>
    </div>
  );
}

export function MarketingLandingPage() {
  return (
    <MarketingShell wide>
      <MarketingLanding />
    </MarketingShell>
  );
}
