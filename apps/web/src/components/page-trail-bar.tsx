"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LABELS: Record<string, string> = {
  hub: "خانه",
  login: "ورود",
  register: "ثبت‌نام",
  profile: "پروفایل",
  onboarding: "ساخت فضا",
  invite: "دعوت",
  "forgot-password": "فراموشی رمز",
  "reset-password": "بازنشانی رمز",
  "verify-email": "تأیید ایمیل",
  workspaces: "مالی",
  procurement: "تدارکات",
  assets: "تجهیزات",
  partnership: "شرکا",
  me: "فضای شخصی",
  group: "گروه",
  groups: "گروه",
  orgs: "سازمان",
  overview: "نمای کلی",
  finance: "خرج‌ها",
  buy: "خرید",
  manage: "مدیریت",
  spaces: "فضاها",
  proposals: "پیشنهاد و رأی",
  "daily-ledger": "دفتر روزانه",
};

function labelForSegment(seg: string): string {
  const clean = seg.replace(/^~/, "").split("--").pop() ?? seg;
  return LABELS[clean] ?? decodeURIComponent(clean);
}

/**
 * Path + back for pages outside MosaicNav (auth, classic shells).
 * Hub uses MosaicBackBar instead.
 */
export function PageTrailBar({
  homeHref = "/hub",
  homeLabel = "خانه",
}: {
  homeHref?: string;
  homeLabel?: string;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const canGoBack = parts.length > 0 && pathname !== homeHref && pathname !== "/";

  return (
    <div className="page-trail-bar" aria-label="مسیر صفحه">
      <button
        type="button"
        className="page-trail-bar__back"
        disabled={!canGoBack}
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
          }
          router.push(homeHref);
        }}
      >
        <span aria-hidden>→</span>
        بازگشت
      </button>
      <nav className="page-trail-bar__crumbs" aria-label="مسیر">
        <Link href={homeHref} className={parts.length === 0 ? "is-current" : undefined}>
          {homeLabel}
        </Link>
        {parts.map((seg, i) => {
          const href = "/" + parts.slice(0, i + 1).join("/");
          const current = i === parts.length - 1;
          return (
            <span key={href} className="page-trail-bar__item">
              <span className="page-trail-bar__sep" aria-hidden>
                /
              </span>
              {current ? (
                <span className="is-current">{labelForSegment(seg)}</span>
              ) : (
                <Link href={href}>{labelForSegment(seg)}</Link>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
