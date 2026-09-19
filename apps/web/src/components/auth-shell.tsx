"use client";

import Link from "next/link";
import {
  type ReactNode,
} from "react";
import { markClientSession, bootstrapDevSession } from "@/lib/api";
import { PageTrailBar } from "@/components/page-trail-bar";
import { StickerSvg } from "@/components/visual/stickers";
import { AuthMark } from "@/components/site/auth-mark";
import {
  SiteFooter,
  SiteHeader,
  SiteStatusProvider,
  useSiteStatus,
} from "@/components/site/marketing-shell";
import { SITE_SERVICE_ITEMS } from "@/lib/site-nav";

export { AuthMark };

const FEATURES = SITE_SERVICE_ITEMS.map((item) => ({
  label: item.title,
  icon:
    item.title.includes("خرید")
      ? ("cart" as const)
      : item.title.includes("شرکا")
        ? ("partners" as const)
        : ("wallet" as const),
}));

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "wallet") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M16 11h5" />
      </svg>
    );
  }
  if (name === "cart") {
    return (
      <svg {...common}>
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
        <path d="M3 4h2l2.5 11h10l3-8H7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
    </svg>
  );
}

function AuthShellFrame({
  eyebrow = "حساب کاربری",
  title,
  description,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { trustBadges } = useSiteStatus();

  return (
    <div className="authLayout">
      <div className="ambient ambient--rich ambient--atmosphere" aria-hidden />
      <SiteHeader compactAuth />

      <div className="authLayout__main">
        <div className="authLayout__frame">
          <aside className="authLayout__hero animated" id="features">
            <div className="authLayout__heroCopy">
              <StickerSvg name="handshake" className="authLayout__heroSticker" />
              <span className="authLayout__heroEyebrow">همکاری شفاف</span>
              <h1>دنگ همکاری</h1>
              <p>
                همهٔ هزینه‌ها، خریدها و حساب‌ها در یک جا — از ثبت خرج تا صورتحساب،
                تأیید خرید و تسویه.
              </p>
            </div>

            <ul className="authLayout__features">
              {FEATURES.map((item) => (
                <li key={item.label}>
                  <span className="authLayout__featureIcon" aria-hidden>
                    <FeatureIcon name={item.icon} />
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>

            {trustBadges.length > 0 ? (
              <div className="authLayout__trustRow" id="security">
                {trustBadges.map((badge) => (
                  <span key={badge} className="authLayout__trustBadge">
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </aside>

          <main className="authLayout__panel card animated" id="main" tabIndex={-1}>
            <header className="authLayout__panelHead">
              <PageTrailBar homeHref="/" homeLabel="خانه" />
              <span className="eyebrow">{eyebrow}</span>
              <h2>{title}</h2>
              {description ? <p>{description}</p> : null}
            </header>
            <div className="authLayout__panelBody">{children}</div>
            {footer ? <footer className="authLayout__panelFooter">{footer}</footer> : null}
          </main>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

export function AuthShell(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SiteStatusProvider>
      <AuthShellFrame {...props} />
    </SiteStatusProvider>
  );
}

export function AuthDivider({ label = "یا" }: { label?: string }) {
  return (
    <div className="authLayout__divider" role="separator">
      <span>{label}</span>
    </div>
  );
}

export function AuthLinkRow({ children }: { children: ReactNode }) {
  return <p className="authLayout__linkRow">{children}</p>;
}

export function AuthDevLink() {
  const { caps } = useSiteStatus();
  if (!caps?.allowDevAuth) return null;
  return (
    <>
      <span aria-hidden>·</span>
      <Link
        href="/spaces/new"
        className="authLayout__devLink"
        onClick={(event) => {
          event.preventDefault();
          markClientSession("dev");
          void bootstrapDevSession()
            .catch(() => undefined)
            .finally(() => {
              window.location.assign("/spaces/new");
            });
        }}
      >
        حالت توسعه
      </Link>
    </>
  );
}

export function AuthAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const className =
    tone === "error"
      ? "liveError authLayout__alert"
      : tone === "success"
        ? "liveSuccess authLayout__alert"
        : "emptyHint authLayout__alert";
  return (
    <p className={className} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
