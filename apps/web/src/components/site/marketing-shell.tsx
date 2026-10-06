"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  markClientSession,
  bootstrapDevSession,
  type HealthReadyResponse,
  type SystemCapabilities,
} from "@/lib/api";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { AuthMark } from "@/components/site/auth-mark";
import {
  SITE_FOOTER_ACCOUNT,
  SITE_FOOTER_PRODUCT,
  SITE_HEADER_NAV,
} from "@/lib/site-nav";

const API_PUBLIC_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3006/api/v1";

export type SiteStatus = {
  health: HealthReadyResponse | null;
  caps: SystemCapabilities | null;
  offline: boolean;
  trustBadges: string[];
  statusLabel: string;
};

const SiteStatusContext = createContext<SiteStatus | null>(null);

const SITE_STATUS_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SITE_STATUS_TIMEOUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export function SiteStatusProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthReadyResponse | null>(null);
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [healthResult, capsResult] = await Promise.all([
        withTimeout(api.healthReady(), SITE_STATUS_TIMEOUT_MS)
          .then((h) => ({ ok: true as const, h }))
          .catch(() => ({ ok: false as const, h: null })),
        withTimeout(api.capabilities(), SITE_STATUS_TIMEOUT_MS)
          .then((c) => ({ ok: true as const, c }))
          .catch(() => ({ ok: false as const, c: null })),
      ]);
      if (cancelled) return;
      setHealth(healthResult.h);
      setCaps(capsResult.c);
      setOffline(!healthResult.ok);
      setLoading(false);
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
    if (!caps.stubs.paymentProvider) {
      if (caps.providers?.payment === "zarinpal") {
        trustBadges.push("PSP واقعی (زرین‌پال)");
      } else if (caps.providers?.payment === "local_psp") {
        trustBadges.push("LocalPSP");
      }
    }
    if (caps.providers?.email === "resend") trustBadges.push("ایمیل واقعی");
    if (caps.providers?.jobs === "redis_queue") trustBadges.push("صف کار واقعی");
    if (caps.persistence.attachmentBlob === "local") {
      trustBadges.push("ذخیره رسید محلی");
    }
  }

  const statusLabel = loading
    ? "در حال بررسی…"
    : offline
      ? "سرویس در دسترس نیست"
      : health?.status === "ready"
        ? `آماده · ${caps?.databaseConfigured ? "متصل" : "بدون DB"}`
        : health?.status === "degraded"
          ? "تخریب‌شده"
          : "پاسخ ناقص از API";

  return (
    <SiteStatusContext.Provider
      value={{ health, caps, offline, trustBadges, statusLabel }}
    >
      {children}
    </SiteStatusContext.Provider>
  );
}

export function useSiteStatus(): SiteStatus {
  const ctx = useContext(SiteStatusContext);
  if (!ctx) {
    throw new Error("useSiteStatus must be used within SiteStatusProvider");
  }
  return ctx;
}

function navActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ compactAuth = false }: { compactAuth?: boolean }) {
  const pathname = usePathname();
  const onLogin = pathname === "/login";
  const onRegister = pathname === "/register";
  const { offline, statusLabel } = useSiteStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="authLayout__header siteHeader">
      <div className="authLayout__headerInner">
        <Link href="/" className="authLayout__brand">
          <AuthMark size="sm" />
          <span className="authLayout__brandText">
            <b>دنگ همکاری</b>
            <small>دفتر عملیات مشترک</small>
          </span>
        </Link>

        <nav className="authLayout__headerNav siteHeader__desktopNav" aria-label="ناوبری سایت">
          {SITE_HEADER_NAV.map((item) => {
            const active = navActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="authLayout__headerActions">
          <ThemeToggleButton />
          {!compactAuth ? (
            <span
              className={`authLayout__statusBadge${offline ? " authLayout__statusBadge--warn" : ""}`}
            >
              <i aria-hidden />
              {statusLabel}
            </span>
          ) : null}
          {!onRegister ? (
            <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary siteHeader__cta">
              ثبت‌نام
            </Link>
          ) : null}
          {!onLogin ? (
            <Link href="/login" className="authLayout__headerBtn siteHeader__cta">
              ورود
            </Link>
          ) : null}
          <button
            type="button"
            className="siteHeader__menuBtn"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "بستن فهرست" : "باز کردن فهرست"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden>{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav id={menuId} className="siteHeader__mobileNav" aria-label="ناوبری موبایل">
          {SITE_HEADER_NAV.map((item) => {
            const active = navActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="siteHeader__mobileActions">
            <Link href="/register" className="authLayout__headerBtn authLayout__headerBtn--primary">
              ثبت‌نام
            </Link>
            <Link href="/login" className="authLayout__headerBtn">
              ورود
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const router = useRouter();
  const { caps } = useSiteStatus();
  const healthUrl = `${API_PUBLIC_BASE.replace(/\/api\/v1\/?$/, "")}/api/v1/health/ready`;
  const allowDev = Boolean(caps?.allowDevAuth);

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
              {SITE_FOOTER_PRODUCT.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="authLayout__footerCol">
            <b>حساب کاربری</b>
            <ul>
              {SITE_FOOTER_ACCOUNT.map((item) => (
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
                {caps?.supportContactEmail ? (
                  <a href={`mailto:${caps.supportContactEmail}`}>
                    {caps.supportContactEmail}
                  </a>
                ) : (
                  <Link href="/contact">فرم تماس</Link>
                )}
              </li>
              {allowDev ? (
                <li>
                  <Link
                    href="/spaces/new"
                    onClick={(event) => {
                      event.preventDefault();
                      markClientSession("dev");
                      void bootstrapDevSession()
                        .catch(() => undefined)
                        .finally(() => {
                          router.refresh();
                          router.push("/spaces/new");
                        });
                    }}
                  >
                    حالت توسعه
                  </Link>
                </li>
              ) : null}
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

/** Full-page marketing chrome for public site routes. */
export function MarketingShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <SiteStatusProvider>
      <div className="authLayout">
        <div className="ambient ambient--rich ambient--atmosphere" aria-hidden />
        <SiteHeader />
        <div className={`authLayout__main${wide ? " authLayout__main--wide" : ""}`}>
          <main className="sitePage" id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
        <SiteFooter />
      </div>
    </SiteStatusProvider>
  );
}
