"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, markClientSession, type HealthReadyResponse, type SystemCapabilities } from "@/lib/api";
import { PageTrailBar } from "@/components/page-trail-bar";
import { ThemeToggleButton } from "@/components/theme-toggle";

const API_PUBLIC_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3006/api/v1";

export function AuthMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? 18 : 22;
  return (
    <span className={`authLayout__mark authLayout__mark--${size}`} aria-hidden>
      <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
        <path
          d="M6 18V6l6 6 6-6v12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const FEATURES = [
  { label: "هزینه و تسویه مشترک", icon: "wallet" },
  { label: "خرید، تجهیزات و بودجه", icon: "cart" },
  { label: "حساب شرکا و گزارش دوره‌ای", icon: "partners" },
] as const;

const HEADER_NAV = [
  { href: "#features", label: "امکانات" },
  { href: "#security", label: "امنیت" },
  { href: "/hub", label: "داشبورد" },
] as const;

const FOOTER_PRODUCT = [
  { href: "/hub/finance", label: "مدیریت مالی" },
  { href: "/hub/buy", label: "خرید و تأمین" },
  { href: "/hub/~workspaces--partnership", label: "حساب شرکا" },
  { href: "/hub/buy/~workspaces--assets", label: "تجهیزات" },
] as const;

const FOOTER_ACCOUNT = [
  { href: "/login", label: "ورود" },
  { href: "/register", label: "ثبت‌نام" },
  { href: "/profile", label: "پروفایل" },
  { href: "/forgot-password", label: "فراموشی رمز" },
] as const;

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

type AuthStatus = {
  health: HealthReadyResponse | null;
  caps: SystemCapabilities | null;
  offline: boolean;
  trustBadges: string[];
  statusLabel: string;
};

const AuthStatusContext = createContext<AuthStatus | null>(null);

function AuthStatusProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthReadyResponse | null>(null);
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [h, c] = await Promise.all([api.healthReady(), api.capabilities()]);
        if (!cancelled) {
          setHealth(h);
          setCaps(c);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trustBadges: string[] = [];
  if (caps) {
    if (caps.persistence.iam === "postgres" && caps.databaseConfigured) {
      trustBadges.push("Postgres + RLS");
    }
    if (!caps.allowDevAuth) trustBadges.push("ورود production");
    if (!caps.stubs.paymentProvider) trustBadges.push("PSP واقعی");
    if (caps.providers?.email === "resend") trustBadges.push("ایمیل واقعی");
    if (caps.providers?.jobs === "redis_queue") trustBadges.push("صف کار واقعی");
    if (caps.persistence.attachmentBlob === "local") {
      trustBadges.push("ذخیره رسید محلی");
    }
  }

  const statusLabel = offline
    ? "سرویس در دسترس نیست"
    : health?.status === "ready"
      ? `آماده · ${caps?.databaseConfigured ? "متصل" : "بدون DB"}`
      : health?.status === "degraded"
        ? "تخریب‌شده"
        : "…";

  const value: AuthStatus = { health, caps, offline, trustBadges, statusLabel };

  return <AuthStatusContext.Provider value={value}>{children}</AuthStatusContext.Provider>;
}

function useAuthStatus(): AuthStatus {
  const ctx = useContext(AuthStatusContext);
  if (!ctx) {
    throw new Error("useAuthStatus must be used within AuthShell");
  }
  return ctx;
}

function AuthHeader() {
  const pathname = usePathname();
  const onLogin = pathname === "/login";
  const onRegister = pathname === "/register";
  const { offline, statusLabel } = useAuthStatus();

  return (
    <header className="authLayout__header">
      <div className="authLayout__headerInner">
        <Link href="/" className="authLayout__brand">
          <AuthMark size="sm" />
          <span className="authLayout__brandText">
            <b>دنگ همکاری</b>
            <small>دفتر عملیات مشترک</small>
          </span>
        </Link>

        <nav className="authLayout__headerNav" aria-label="ناوبری اصلی">
          {HEADER_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="authLayout__headerActions">
          <ThemeToggleButton />
          <span
            className={`authLayout__statusBadge${offline ? " authLayout__statusBadge--warn" : ""}`}
          >
            <i aria-hidden />
            {statusLabel}
          </span>
          {!onRegister ? (
            <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary">
              ثبت‌نام
            </Link>
          ) : null}
          {!onLogin ? (
            <Link href="/login" className="authLayout__headerBtn">
              ورود
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function AuthSiteFooter() {
  const year = new Date().getFullYear();
  const { caps } = useAuthStatus();
  const healthUrl = `${API_PUBLIC_BASE.replace(/\/api\/v1\/?$/, "")}/api/v1/health/ready`;

  return (
    <footer className="authLayout__siteFooter">
      <div className="authLayout__footerInner">
        <div className="authLayout__footerGrid">
          <div className="authLayout__footerBrand">
            <Link href="/" className="authLayout__brand authLayout__brand--footer">
              <AuthMark size="sm" />
              <span className="authLayout__brandText">
                <b>دنگ همکاری</b>
                <small>هزینه · خرید · تجهیزات · شرکا</small>
              </span>
            </Link>
            <p>
              پلتفرم عملیاتی برای تیم‌ها و پروژه‌های مشترک — شفاف، قابل پیگیری و
              آمادهٔ رشد.
            </p>
          </div>

          <div className="authLayout__footerCol">
            <b>محصول</b>
            <ul>
              {FOOTER_PRODUCT.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="authLayout__footerCol">
            <b>حساب کاربری</b>
            <ul>
              {FOOTER_ACCOUNT.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="authLayout__footerCol">
            <b>پشتیبانی</b>
            <ul>
              <li>
                <a href="mailto:support@dang.local">support@dang.local</a>
              </li>
              <li>
                <Link href="/hub/onboarding">راه‌اندازی اولیه</Link>
              </li>
              <li>
                <a href={healthUrl} target="_blank" rel="noreferrer">
                  وضعیت سرویس (API)
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="authLayout__footerBar">
          <span>
            © {year} دنگ همکاری · نسخه {caps?.version ?? "…"}
            {caps
              ? ` · IAM ${caps.persistence.iam} · اعلان ${caps.persistence.notification}`
              : null}
          </span>
        </div>
      </div>
    </footer>
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
  const { trustBadges } = useAuthStatus();

  return (
    <div className="authLayout">
      <div className="ambient ambient--rich" aria-hidden />
      <AuthHeader />

      <div className="authLayout__main">
        <div className="authLayout__frame">
          <aside className="authLayout__hero animated" id="features">
            <div className="authLayout__heroCopy">
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

          <main className="authLayout__panel card animated">
            <header className="authLayout__panelHead">
              <PageTrailBar homeHref="/login" homeLabel="ورود" />
              <span className="eyebrow">{eyebrow}</span>
              <h2>{title}</h2>
              {description ? <p>{description}</p> : null}
            </header>
            <div className="authLayout__panelBody">{children}</div>
            {footer ? <footer className="authLayout__panelFooter">{footer}</footer> : null}
          </main>
        </div>
      </div>

      <AuthSiteFooter />
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
    <AuthStatusProvider>
      <AuthShellFrame {...props} />
    </AuthStatusProvider>
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
  const { caps } = useAuthStatus();
  if (!caps?.allowDevAuth) return null;
  return (
    <>
      <span aria-hidden>·</span>
      <Link
        href="/hub/onboarding"
        className="authLayout__devLink"
        onClick={() => {
          markClientSession("dev");
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
