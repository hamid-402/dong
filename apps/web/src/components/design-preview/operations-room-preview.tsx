"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MembershipRole, WorkspaceTemplate } from "@dang/contracts";
import styles from "./operations-room-preview.module.css";
import {
  GROUP_LABELS,
  PREVIEW_ALIASES,
  PREVIEW_ROLES,
  PREVIEW_SCREENS,
  PREVIEW_TEMPLATES,
  ROLE_LABELS,
  TEMPLATE_LABELS,
  getPreviewScreen,
  previewAccess,
  previewHref,
  visiblePreviewScreens,
  type PreviewContext,
  type PreviewFlagMode,
  type PreviewGroup,
  type PreviewMfaMode,
  type PreviewScreen,
  type PreviewScreenId,
} from "./operations-room-model";

type IconName =
  | "home"
  | "wallet"
  | "check"
  | "cart"
  | "users"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "grid"
  | "chart"
  | "shield"
  | "arrow"
  | "receipt";

const GROUP_ICONS: Record<PreviewGroup, IconName> = {
  auth: "shield",
  account: "users",
  home: "home",
  finance: "wallet",
  operations: "cart",
  workspace: "users",
  system: "grid",
};

const ROLE_NOTES: Record<MembershipRole, string> = {
  owner: "مدیریت کامل فضا و عملیات مالی حساس",
  admin: "مدیریت فضا، اعضا و عملیات مالی",
  finance: "دید کامل مالی و اقدامات حساس",
  approver: "تصمیم روی خرج و بازپرداخت",
  buyer: "فروشنده، سفارش و تحویل خرید",
  asset_custodian: "تخصیص، انتقال و خرابی تجهیزات",
  member: "ثبت و پیگیری عملیات شخصی",
  auditor: "مشاهده بدون تغییر اطلاعات",
  guest: "دسترسی موقت و فقط‌خواندنی",
};

const SCREEN_DATA: Record<
  PreviewScreenId,
  {
    metrics?: readonly [string, string][];
    sections: readonly [string, string, IconName][];
    rows?: readonly [string, string, string][];
  }
> = {
  login: { sections: [["ورود با رمز", "ایمیل و رمز عبور با پیام خطای روشن", "shield"], ["ورود سازمانی", "فقط هنگام اتصال واقعی OIDC نمایش داده می‌شود", "users"]] },
  register: { sections: [["مشخصات حساب", "نام، ایمیل و رمز ایمن", "users"], ["پذیرش قوانین", "رضایت آگاهانه پیش از ساخت حساب", "check"]] },
  "forgot-password": { sections: [["ایمیل بازیابی", "ارسال پیوند فقط از سرویس ایمیل فعال", "receipt"], ["بازگشت امن", "بدون افشای وجود یا نبود حساب", "shield"]] },
  "reset-password": { sections: [["رمز تازه", "کنترل قدرت و تطبیق دو ورودی", "shield"], ["پایان نشست‌ها", "امکان خروج از نشست‌های قبلی", "check"]] },
  "verify-email": { sections: [["وضعیت ایمیل", "نمایش نتیجه واقعی تأیید", "check"], ["ارسال دوباره", "وابسته به قابلیت mail runtime", "receipt"]] },
  invite: { sections: [["فضای مقصد", "نام فضا، الگو و دعوت‌کننده", "grid"], ["نقش پیشنهادی", "شرح دسترسی پیش از پذیرش", "shield"]] },
  account: { metrics: [["زبان", "فارسی"], ["منطقه زمانی", "Asia/Tehran"]], sections: [["مشخصات عمومی", "نام نمایشی، زبان و منطقه زمانی", "users"], ["خروج", "پایان نشست جاری با تأیید", "arrow"]] },
  "account-security": { metrics: [["MFA", "قابل مدیریت"], ["نشست فعال", "۱"]], sections: [["رمز عبور", "تغییر رمز با بررسی رمز فعلی", "shield"], ["تأیید دومرحله‌ای", "QR، کد بازیابی و لغو امن", "check"], ["نشست‌ها", "مشاهده و بستن نشست‌های فعال", "users"]] },
  spaces: { metrics: [["فضای فعال", "vidaverse"], ["الگو", "پویا"]], sections: [["فضای شخصی", "خرج‌ها و منابع متعلق به خود کاربر", "wallet"], ["فضاهای گروهی", "دوستان و خانواده با تسویه", "users"], ["فضاهای سازمانی", "خرید، دارایی و حاکمیت", "grid"]] },
  "spaces-new": { sections: [["نوع فضا", "یکی از شش الگوی واقعی محصول", "grid"], ["نام و نشانی", "نام فضای کاری و slug یکتا", "settings"], ["مرور دسترسی", "ماژول‌های فعال پیش از ساخت", "shield"]] },
  "whats-new": { sections: [["تحویل‌های اخیر", "فقط قابلیت‌های واقعاً منتشرشده", "check"], ["مرز قابلیت", "providerهای stub با برچسب روشن", "shield"]] },
  "ui-kit": { sections: [["توکن‌ها", "رنگ، فاصله، تایپوگرافی و focus", "grid"], ["کنترل‌ها", "دکمه، ورودی، انتخاب و وضعیت", "settings"], ["الگوهای داده", "جدول، صف، inspector و نمودار", "chart"]] },
  "workspace-home": { metrics: [["مانده خالص", "۰ تومان"], ["تصمیم باز", "۲"], ["خرج دوره", "۲٬۷۵۰٬۰۰۰"]], sections: [["صف تصمیم", "دو خرج برای بررسی", "check"], ["جریان امروز", "چهار رویداد ثبت‌شده", "chart"]] },
  "workspace-space": { metrics: [["عضو", "۱"], ["خرج", "۴"], ["مانده", "۰"]], sections: [["خلاصه فضا", "محتوا بر اساس personal/group/org تغییر می‌کند", "grid"], ["دسترسی‌های سریع", "مالی، اعضا، گزارش و تنظیمات", "arrow"]] },
  expenses: { metrics: [["کل دوره", "۲٬۷۵۰٬۰۰۰"], ["در بررسی", "۲"], ["تأییدشده", "۲"]], sections: [["ثبت مرحله‌ای", "مبلغ، پرداخت‌کننده، سهم و پیوست", "plus"], ["دید و حریم خصوصی", "جمعی، خصوصی و شرکتی", "shield"]], rows: [["خرید مصالح", "۱٬۲۵۰٬۰۰۰ تومان", "تأییدشده"], ["نوشابه", "۵۰۰٬۰۰۰ تومان", "در بررسی"], ["نوشابه", "۵۰۰٬۰۰۰ تومان", "در بررسی"], ["خرید مصالح", "۵۰۰٬۰۰۰ تومان", "تأییدشده"]] },
  settlements: { metrics: [["مانده شما", "۰ تومان"], ["ادعای باز", "۰"]], sections: [["ثبت ادعا", "از حساب خود یا با اختیار مدیر مالی", "wallet"], ["چرخه اختلاف", "تأیید، اعتراض، لغو و مدرک", "check"], ["ساده‌سازی", "فقط مدیر مالی و MFA", "chart"]] },
  invoices: { metrics: [["دوره فعال", "شهریور ۱۴۰۵"], ["صورتحساب باز", "۰"]], sections: [["مدیریت دوره", "ایجاد، تولید، صدور و بستن", "grid"], ["اقدام عضو", "تأیید یا اعتراض صورتحساب خود", "check"], ["پرداخت", "فقط با PSP واقعی یا ثبت دستی مجاز", "wallet"]] },
  recurring: { metrics: [["قاعده فعال", "۰"], ["دسته‌ها", "پویا"]], sections: [["قواعد تکراری", "نسخه‌بندی مبلغ بدون حذف تاریخچه", "receipt"], ["گزارش بازه‌ای", "گروه‌بندی و مقایسه BI", "chart"], ["دسته‌بندی", "ساختار والد و فرزند", "grid"]] },
  addons: { metrics: [["در انتظار تأیید", "۰"], ["جمع", "۰ تومان"]], sections: [["ثبت اضافه", "عضو هدف، مبلغ و توضیح", "plus"], ["تأیید دریافت", "فقط عضو هدف در صف اقدام", "check"]] },
  approvals: { metrics: [["صف شما", "۲"], ["فوری", "۰"]], sections: [["خرج", "تصمیم بر اساس نقش و workflow", "receipt"], ["صورتحساب", "تأیید یا ثبت اختلاف", "wallet"], ["اضافه شخصی", "تأیید عضو هدف", "check"]], rows: [["نوشابه", "۵۰۰٬۰۰۰ تومان", "در انتظار"], ["نوشابه", "۵۰۰٬۰۰۰ تومان", "در انتظار"]] },
  "org-finance": { metrics: [["ابزار فعال", "۸"], ["نقش", "پویا"]], sections: [["مرکز هزینه", "کد و نام یکتا در فضای کاری", "grid"], ["سقف اعضا", "دوره هفتگی یا ماهانه", "users"], ["بازپرداخت", "درخواست، تأیید، رد و پرداخت", "wallet"], ["سیاست خرج", "قانون و محدودیت ثبت", "shield"], ["بودجه دسته", "سقف و مصرف واقعی", "chart"], ["ورود CSV", "پیش‌نمایش و ثبت کنترل‌شده", "receipt"]] },
  ledger: { metrics: [["روز جاری", "۱۷ شهریور"], ["قلم‌ها", "۴"]], sections: [["بازه شمسی", "روز، هفته و بازه سفارشی", "grid"], ["قلم دفتر", "عضو، کالا، تعطیلی و یادداشت", "receipt"], ["خروجی و تسویه", "CSV و پیشنهاد تسویه از دفتر", "chart"]] },
  procurement: { metrics: [["نیاز باز", "۰"], ["سفارش فعال", "۰"]], sections: [["نیاز و درخواست", "شرح نیاز تا تصمیم خرید", "cart"], ["فروشندگان", "ثبت و انتخاب توسط نقش خریدار", "users"], ["سفارش و تحویل", "ثبت سفارش، تحویل و ایجاد دارایی", "check"]] },
  proposals: { metrics: [["فعال", "۰"], ["حدنصاب", "تنظیم‌شده"]], sections: [["ثبت پیشنهاد", "عنوان، شرح و زمان رأی", "plus"], ["رأی‌گیری", "موافق، مخالف و وضعیت حدنصاب", "check"], ["تبدیل به نیاز", "انتقال پیشنهاد پذیرفته‌شده به خرید", "cart"]] },
  assets: { metrics: [["دارایی", "۰"], ["در اختیار", "۰"]], sections: [["فهرست تجهیزات", "وضعیت و منشأ تحویل", "grid"], ["تخصیص و انتقال", "فقط نقش امانت‌دار یا مدیر", "users"], ["ثبت خرابی", "شرح رخداد و وضعیت بعدی", "shield"]] },
  members: { metrics: [["عضو فعال", "۱"], ["مدیر مالی", "۱"]], sections: [["اعضا و نقش", "۹ نقش واقعی فضای کاری", "users"], ["دعوت امن", "لینک پذیرش و انقضا", "plus"], ["قانون پشتیبان", "حداقل دو مدیر مالی پس از bootstrap", "shield"]] },
  partners: { metrics: [["قرارداد", "۰"], ["آورده", "۰ تومان"]], sections: [["قرارداد شراکت", "طرف‌ها، تاریخ و مفاد مالی", "receipt"], ["آورده و قرض", "ثبت جریان سرمایه و برداشت", "wallet"], ["مالکیت و قفل", "گزارش سهم و قفل بازه", "shield"]] },
  settings: { sections: [["مشخصات فضا", "نام، واحد نمایش و منطقه زمانی", "settings"], ["الگو و ماژول", "نمایش ساختار فعال بدون حذف داده", "grid"], ["مقصدهای مدیریت", "اعضا، متریک و نمای فضا", "arrow"]] },
  audit: { metrics: [["کل رخداد", "پویا"], ["موفق", "پویا"]], sections: [["جستجو و فیلتر", "عملیات، هدف، عامل و نتیجه", "search"], ["بازرس رخداد", "زمان، request id و فراداده", "shield"]] },
  metrics: { metrics: [["منبع", "runtime"], ["وضعیت", "وابسته به API"]], sections: [["شاخص‌های محصول", "فقط رویدادهای ثبت‌شده", "chart"], ["کیفیت داده", "زمان آخرین ثبت و پوشش", "check"]] },
  more: { sections: [["مالی", "تسویه، صورتحساب، تکرارشونده و دفتر", "wallet"], ["خرید و حاکمیت", "تدارکات، پیشنهاد و تجهیزات", "cart"], ["مدیریت فضا", "اعضا، شرکا و تنظیمات", "users"], ["حساب", "امنیت، تغییرات و فضاها", "settings"]] },
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    home: "M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7",
    wallet: "M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6h16M16 12h5v4h-5a2 2 0 0 1 0-4Z",
    check: "m5 12 4 4L19 6",
    cart: "M3 4h2l2.4 10.4A2 2 0 0 0 9.35 16H18a2 2 0 0 0 1.9-1.37L22 8H7M10 21h.01M18 21h.01",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12h2M3 12h2M12 3v2M12 19v2M18.36 5.64l-1.42 1.42M7.06 16.94l-1.42 1.42M18.36 18.36l-1.42-1.42M7.06 7.06 5.64 5.64",
    search: "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
    plus: "M12 5v14M5 12h14",
    grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
    chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-5",
    arrow: "m9 18 6-6-6-6",
    receipt: "M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2-3-2ZM9 10h6M9 14h6",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function PreviewButton({
  children,
  onClick,
  kind = "quiet",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  kind?: "primary" | "quiet" | "danger";
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`${styles.button} ${styles[`button_${kind}`]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function AuthSurface({ screen, onAction }: { screen: PreviewScreen; onAction: (message: string) => void }) {
  const data = SCREEN_DATA[screen.id as PreviewScreenId];
  return (
    <div className={styles.authStage}>
      <div className={styles.authStory}>
        <span className={styles.previewMark}>DESIGN PREVIEW</span>
        <h1>مالی مشترک، بدون ابهام.</h1>
        <p>نمونه اتاق عملیات؛ با حفظ کامل امنیت، نقش‌ها و مسیرهای واقعی محصول.</p>
        <div className={styles.authProof}>
          <Icon name="shield" />
          <span>این صفحه عملیات واقعی انجام نمی‌دهد.</span>
        </div>
      </div>
      <section className={styles.authCard}>
        <div className={styles.logo}>د</div>
        <span className={styles.eyebrow}>{screen.eyebrow}</span>
        <h2>{screen.title}</h2>
        <p>{screen.summary}</p>
        <label className={styles.fieldLabel}>
          {screen.id.includes("password") || screen.id === "verify-email" ? "ایمیل" : "ایمیل یا شناسه"}
          <input className={styles.input} value="preview@dang.local" readOnly />
        </label>
        {["login", "register", "reset-password"].includes(screen.id) ? (
          <label className={styles.fieldLabel}>
            رمز عبور
            <input className={styles.input} value="••••••••••••" readOnly type="password" />
          </label>
        ) : null}
        <PreviewButton kind="primary" onClick={() => onAction(`${screen.title}: تعامل پیش‌نمایش اجرا شد`)}>
          ادامه
        </PreviewButton>
        <div className={styles.authDetails}>
          {data.sections.map(([title, detail, icon]) => (
            <div key={title}><Icon name={icon} size={15} /><span><b>{title}</b><small>{detail}</small></span></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OperationsChart() {
  return (
    <div className={styles.opsChart}>
      <div className={styles.chartHeader}>
        <div><b>ریتم تصمیم‌های امروز</b><small>پیش‌نمایش بر پایه داده ثبت‌شده در نمونه</small></div>
        <div className={styles.chartLegend}><span className={styles.doneDot}>۳ تکمیل</span><span className={styles.openDot}>۲ باز</span></div>
      </div>
      <svg viewBox="0 0 760 210" role="img" aria-label="نمودار متحرک ریتم تصمیم‌ها">
        <path className={styles.chartGrid} d="M0 180H760M0 130H760M0 80H760M0 30H760" />
        <path className={styles.chartBaseline} d="M0 188 C140 180 245 159 365 143 S610 101 760 72" />
        <path className={styles.chartLine} d="M0 176 C55 176 72 154 116 156 S176 101 228 108 S300 154 354 137 S424 70 480 77 S552 111 608 88 S691 31 760 39" />
        {[116, 228, 354, 480, 608, 760].map((x, index) => (
          <circle key={x} className={index < 3 ? styles.chartPointDone : styles.chartPointOpen} cx={x} cy={[156, 108, 137, 77, 88, 39][index]} r="5" />
        ))}
        <circle className={styles.chartRunner} r="5">
          <animateMotion dur="4s" repeatCount="indefinite" path="M0 176 C55 176 72 154 116 156 S176 101 228 108 S300 154 354 137 S424 70 480 77 S552 111 608 88 S691 31 760 39" />
        </circle>
      </svg>
      <div className={styles.chartAxis}><span>شروع روز</span><span>میانه</span><span>اکنون</span></div>
    </div>
  );
}

function WorkspaceHome({ onAction }: { onAction: (message: string) => void }) {
  return (
    <>
      <div className={styles.metricBand} tabIndex={0} aria-label="شاخص‌های مالی قابل پیمایش">
        {SCREEN_DATA["workspace-home"].metrics?.map(([label, value], index) => (
          <div key={label} className={index === 0 ? styles.metricPrimary : ""}><small>{label}</small><strong>{value}</strong><span>{index === 0 ? "حساب متوازن" : index === 1 ? "نیازمند اقدام" : "چهار تراکنش"}</span></div>
        ))}
      </div>
      <div className={styles.dashboardGrid}>
        <OperationsChart />
        <section className={styles.decisionQueue}>
          <div className={styles.panelTitle}><span><b>صف تصمیم</b><small>مرتب‌شده بر اساس فوریت</small></span><span className={styles.count}>۲</span></div>
          {["نوشابه · ۵۰۰٬۰۰۰ تومان", "نوشابه · ۵۰۰٬۰۰۰ تومان"].map((item, index) => (
            <button type="button" key={item + index} onClick={() => onAction(`مورد ${index + 1} در inspector باز شد`)}>
              <span className={styles.statusDot} /><span><b>{item}</b><small>ثبت توسط hamid</small></span><Icon name="arrow" size={15} />
            </button>
          ))}
          <PreviewButton kind="primary" onClick={() => onAction("مرکز تأیید باز شد")}>باز کردن مرکز تأیید</PreviewButton>
        </section>
      </div>
      <div className={styles.activityStrip}>
        <div><span className={styles.doneDot} /><b>خرید مصالح</b><small>۱٬۲۵۰٬۰۰۰ تومان · تأییدشده</small></div>
        <div><span className={styles.doneDot} /><b>خرید مصالح</b><small>۵۰۰٬۰۰۰ تومان · تأییدشده</small></div>
        <div><span className={styles.openDot} /><b>۲ اقدام باز</b><small>مجموع ۱٬۰۰۰٬۰۰۰ تومان</small></div>
      </div>
    </>
  );
}

function AccessBanner({
  access,
  onAction,
}: {
  access: ReturnType<typeof previewAccess>;
  onAction: (message: string) => void;
}) {
  if (access.writable) return null;
  const title = !access.visible
    ? "این مقصد در زمینه جاری پنهان است"
    : access.needsMfa
      ? "MFA برای این اقدام لازم است"
      : "این نما فقط‌خواندنی است";
  return (
    <div className={access.needsMfa ? styles.mfaBanner : styles.readOnlyBanner}>
      <Icon name={access.needsMfa || !access.visible ? "shield" : "check"} />
      <span><b>{title}</b><small>{access.reason}</small></span>
      {access.needsMfa ? <PreviewButton onClick={() => onAction("پیش‌نمایش راه‌اندازی MFA باز شد")}>راه‌اندازی MFA</PreviewButton> : null}
    </div>
  );
}

function GenericSurface({
  screen,
  context,
  onAction,
}: {
  screen: PreviewScreen;
  context: PreviewContext;
  onAction: (message: string) => void;
}) {
  const data = SCREEN_DATA[screen.id as PreviewScreenId];
  const access = previewAccess(screen, context);
  return (
    <>
      <AccessBanner access={access} onAction={onAction} />
      {data.metrics?.length ? (
        <div className={styles.compactMetrics}>
          {data.metrics.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </div>
      ) : null}
      <div className={styles.workGrid}>
        <section className={styles.primaryWork}>
          <div className={styles.panelTitle}>
            <span><b>سطح کار</b><small>{screen.summary}</small></span>
            {screen.primaryAction ? (
              <PreviewButton kind="primary" disabled={!access.writable} onClick={() => onAction(`${screen.primaryAction} باز شد`)}>
                <Icon name="plus" size={14} /> {screen.primaryAction}
              </PreviewButton>
            ) : null}
          </div>
          {data.rows?.length ? (
            <div className={styles.dataTable}>
              <div className={styles.tableHead}><span>عنوان</span><span>مقدار</span><span>وضعیت</span></div>
              {data.rows.map(([title, value, status], index) => (
                <button key={`${title}-${index}`} type="button" onClick={() => onAction(`${title} در inspector باز شد`)}>
                  <span><i className={status.includes("تأیید") ? styles.doneDot : styles.openDot} />{title}</span><span>{value}</span><span>{status}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.sectionTiles}>
              {data.sections.map(([title, detail, icon]) => (
                <button type="button" key={title} onClick={() => onAction(`${title} انتخاب شد`)}>
                  <span className={styles.tileIcon}><Icon name={icon} /></span>
                  <span><b>{title}</b><small>{detail}</small></span>
                  <Icon name="arrow" size={15} />
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className={styles.inspector}>
          <span className={styles.eyebrow}>INSPECTOR</span>
          <h3>{data.sections[0]?.[0] ?? screen.title}</h3>
          <p>{data.sections[0]?.[1] ?? screen.summary}</p>
          <dl>
            <div><dt>نقش جاری</dt><dd>{ROLE_LABELS[context.role]}</dd></div>
            <div><dt>دسترسی</dt><dd>{access.reason}</dd></div>
            <div><dt>الگوی فضا</dt><dd>{TEMPLATE_LABELS[context.template]}</dd></div>
            <div><dt>قابلیت‌ها</dt><dd>{context.flagMode === "full" ? "کامل" : "هسته"}</dd></div>
          </dl>
          <PreviewButton disabled={!access.writable} onClick={() => onAction("اقدام inspector اجرا شد")}>اقدام روی مورد</PreviewButton>
        </aside>
      </div>
    </>
  );
}

function AccessLab({
  context,
  current,
  onClose,
}: {
  context: PreviewContext;
  current: PreviewScreen;
  onClose: () => void;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section className={styles.accessLab} role="dialog" aria-modal="true" aria-label="آزمایشگاه دسترسی" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><div><span className={styles.eyebrow}>ACCESS LAB</span><h2>نقش‌ها در «{current.title}»</h2></div><PreviewButton onClick={onClose}>بستن</PreviewButton></div>
        <div className={styles.accessRows}>
          {PREVIEW_ROLES.map((role) => {
            const access = previewAccess(current, { ...context, role });
            return (
              <div key={role}>
                <span><b>{ROLE_LABELS[role]}</b><small>{ROLE_NOTES[role]}</small></span>
                <span className={access.writable ? styles.accessWrite : access.visible ? styles.accessRead : styles.accessHidden}>
                  {access.writable ? "مشاهده و اقدام" : access.visible ? access.needsMfa ? "نیازمند MFA" : "فقط مشاهده" : "پنهان"}
                </span>
                <small>{access.reason}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function OperationsRoomPreview({ initialScreen }: { initialScreen?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [commandOpen, setCommandOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("پیش‌نمایش آماده است؛ هیچ عملیات واقعی انجام نمی‌شود.");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const searchRef = useRef<HTMLInputElement>(null);

  const role = (searchParams.get("role") ?? "owner") as MembershipRole;
  const template = (searchParams.get("template") ?? "small_team") as WorkspaceTemplate;
  const flagMode = (searchParams.get("flags") ?? "full") as PreviewFlagMode;
  const mfa = (searchParams.get("mfa") ?? "enrolled") as PreviewMfaMode;
  const context: PreviewContext = {
    role: PREVIEW_ROLES.includes(role) ? role : "owner",
    template: PREVIEW_TEMPLATES.includes(template) ? template : "small_team",
    flagMode: flagMode === "core" ? "core" : "full",
    mfa: mfa === "required" ? "required" : "enrolled",
  };
  const screen = getPreviewScreen(initialScreen);
  const access = previewAccess(screen, context);
  const visibleScreens = useMemo(() => visiblePreviewScreens(context), [context.role, context.template, context.flagMode, context.mfa]);

  const navigate = (id: PreviewScreenId) => {
    const queryString = searchParams.toString();
    router.push(`${previewHref(id)}${queryString ? `?${queryString}` : ""}`);
    setCommandOpen(false);
    setWorkspaceOpen(false);
  };

  const updateContext = (key: "role" | "template" | "flags" | "mfa", value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setWorkspaceOpen(false);
        setAccessOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (window.matchMedia?.("(max-width: 700px)").matches) {
      setDevice("mobile");
    }
  }, []);

  useEffect(() => {
    if (commandOpen) searchRef.current?.focus();
  }, [commandOpen]);

  const commandResults = visibleScreens.filter((item) =>
    `${item.title} ${item.eyebrow} ${item.summary}`.includes(query.trim()),
  );
  const navGroups = (["home", "finance", "operations", "workspace", "account", "system"] as PreviewGroup[])
    .map((group) => ({
      group,
      screens: visibleScreens.filter((item) => item.group === group && item.id !== "workspace-home"),
    }))
    .filter((item) => item.screens.length > 0);

  return (
    <div className={styles.previewPage} dir="rtl">
      <div className={styles.previewToolbar}>
        <span className={styles.previewBadge}>پیش‌نمایش طراحی؛ داده نمونه و عملیات غیرفعال</span>
        <div className={styles.previewControls}>
          <label>نقش<select value={context.role} onChange={(event) => updateContext("role", event.target.value)}>{PREVIEW_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></label>
          <label>نوع فضا<select value={context.template} onChange={(event) => updateContext("template", event.target.value)}>{PREVIEW_TEMPLATES.map((item) => <option key={item} value={item}>{TEMPLATE_LABELS[item]}</option>)}</select></label>
          <label>قابلیت<select value={context.flagMode} onChange={(event) => updateContext("flags", event.target.value)}><option value="full">کامل</option><option value="core">هسته</option></select></label>
          <label>MFA<select value={context.mfa} onChange={(event) => updateContext("mfa", event.target.value)}><option value="enrolled">فعال</option><option value="required">نیازمند راه‌اندازی</option></select></label>
          <div className={styles.deviceToggle}><button type="button" className={device === "desktop" ? styles.active : ""} onClick={() => setDevice("desktop")}>دسکتاپ</button><button type="button" className={device === "mobile" ? styles.active : ""} onClick={() => setDevice("mobile")}>موبایل</button></div>
        </div>
      </div>

      <div className={`${styles.deviceStage} ${device === "mobile" ? styles.mobileStage : ""}`}>
        <div className={styles.shell}>
          <header className={styles.commandBar}>
            <button type="button" className={styles.brand} onClick={() => navigate("workspace-home")}><span className={styles.logo}>د</span><span><b>اتاق عملیات</b><small>DANG / PREVIEW</small></span></button>
            <button type="button" className={styles.workspaceButton} onClick={() => setWorkspaceOpen((value) => !value)} aria-expanded={workspaceOpen}><span><b>vidaverse</b><small>{TEMPLATE_LABELS[context.template]}</small></span><Icon name="arrow" size={14} /></button>
            <button type="button" className={styles.searchButton} aria-label="جستجو یا اجرای فرمان" onClick={() => setCommandOpen(true)}><Icon name="search" size={15} /><span>جستجو یا اجرای فرمان</span><kbd>Ctrl K</kbd></button>
            <div className={styles.headerActions}>
              <span className={styles.liveStatus}><i />PREVIEW</span>
              <button type="button" aria-label="آزمایشگاه دسترسی" onClick={() => setAccessOpen(true)}><Icon name="shield" /></button>
              <button type="button" aria-label="اعلان‌ها" onClick={() => setNotice("پنل اعلان پیش‌نمایش باز شد")}><Icon name="bell" /></button>
              <button type="button" className={styles.avatar} onClick={() => navigate("account")}>HK</button>
            </div>
            {workspaceOpen ? (
              <div className={styles.workspacePopover}>
                <span className={styles.eyebrow}>اتاق‌های شما</span>
                {([
                  ["vidaverse", context.template],
                  ["دفتر شخصی", "personal"],
                  ["خانه و خانواده", "household"],
                ] satisfies Array<[string, WorkspaceTemplate]>).map(([name, workspaceTemplate]) => (
                  <button type="button" key={name} onClick={() => { updateContext("template", workspaceTemplate); setWorkspaceOpen(false); }}>
                    <span className={styles.roomMark}>{name.slice(0, 1)}</span><span><b>{name}</b><small>{TEMPLATE_LABELS[workspaceTemplate]}</small></span>{name === "vidaverse" ? <Icon name="check" size={15} /> : null}
                  </button>
                ))}
                <PreviewButton onClick={() => navigate("spaces")}>مدیریت همه فضاها</PreviewButton>
              </div>
            ) : null}
          </header>

          <div className={styles.shellBody}>
            <nav className={styles.missionRail} aria-label="ماموریت‌های اصلی">
              <button type="button" className={screen.group === "home" ? styles.railActive : ""} onClick={() => navigate("workspace-home")}><Icon name="home" /><span>خانه</span></button>
              {navGroups.map(({ group, screens }) => (
                <button key={group} type="button" className={screen.group === group ? styles.railActive : ""} onClick={() => navigate(screens[0]!.id as PreviewScreenId)}>
                  <Icon name={GROUP_ICONS[group]} /><span>{GROUP_LABELS[group]}</span>
                </button>
              ))}
              <button type="button" onClick={() => navigate("more")}><Icon name="grid" /><span>همه</span></button>
            </nav>

            <main className={styles.workspace}>
              <div className={styles.contextBar}>
                <div><button type="button" onClick={() => navigate("workspace-home")}>vidaverse</button><Icon name="arrow" size={12} /><span>{GROUP_LABELS[screen.group]}</span><Icon name="arrow" size={12} /><b>{screen.title}</b></div>
                <button type="button" onClick={() => setAccessOpen(true)} className={styles.roleChip}><Icon name="shield" size={13} />{ROLE_LABELS[context.role]} · {access.reason}</button>
              </div>
              <div className={styles.pageHeader}>
                <div><span className={styles.eyebrow}>{screen.eyebrow}</span><h1>{screen.title}</h1><p>{screen.summary}</p></div>
                <div className={styles.pageActions}>
                  <PreviewButton onClick={() => setNotice(`${screen.title} تازه‌سازی شد`)}>تازه‌سازی</PreviewButton>
                  {screen.primaryAction ? <PreviewButton kind="primary" disabled={!access.writable} onClick={() => setNotice(`${screen.primaryAction} باز شد`)}><Icon name="plus" size={14} />{screen.primaryAction}</PreviewButton> : null}
                </div>
              </div>
              <div className={styles.pageContent}>
                {screen.scope === "public" ? <AuthSurface screen={screen} onAction={setNotice} /> : screen.id === "workspace-home" ? <WorkspaceHome onAction={setNotice} /> : <GenericSurface screen={screen} context={context} onAction={setNotice} />}
              </div>
              <div className={styles.liveNotice} aria-live="polite">{notice}</div>
            </main>
          </div>

          <nav className={styles.mobileDock} aria-label="ناوبری موبایل">
            {[["workspace-home", "خانه", "home"], ["expenses", "خرج‌ها", "wallet"], ["approvals", "تصمیم", "check"], ["more", "بیشتر", "grid"]].map(([id, label, icon]) => (
              <button key={id} type="button" className={screen.id === id ? styles.dockActive : ""} onClick={() => navigate(id as PreviewScreenId)}><Icon name={icon as IconName} /><span>{label}</span></button>
            ))}
          </nav>
        </div>
      </div>

      <details className={styles.routeMap}>
        <summary>نقشه ۳۰ صفحه و مسیرهای سازگاری</summary>
        <div className={styles.routeMapGrid}>
          {PREVIEW_SCREENS.map((item) => <button type="button" key={item.id} onClick={() => navigate(item.id)}><span>{item.title}</span><code>{previewHref(item.id)}</code></button>)}
        </div>
        <div className={styles.aliases}>{Object.entries(PREVIEW_ALIASES).map(([alias, target]) => <span key={alias}><code>{alias}</code><Icon name="arrow" size={12} /><code>{target}</code></span>)}</div>
      </details>

      {commandOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setCommandOpen(false)}>
          <section className={styles.commandPalette} role="dialog" aria-modal="true" aria-label="مرکز فرمان" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.commandInput}><Icon name="search" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="صفحه، ابزار یا اقدام..." aria-label="جستجوی فرمان" /><kbd>Esc</kbd></div>
            <div className={styles.commandResults}>
              {commandResults.map((item) => <button type="button" key={item.id} onClick={() => navigate(item.id as PreviewScreenId)}><span className={styles.commandIcon}><Icon name={GROUP_ICONS[item.group]} /></span><span><b>{item.title}</b><small>{GROUP_LABELS[item.group]} · {item.summary}</small></span><Icon name="arrow" size={14} /></button>)}
            </div>
          </section>
        </div>
      ) : null}
      {accessOpen ? <AccessLab context={context} current={screen} onClose={() => setAccessOpen(false)} /> : null}
    </div>
  );
}
