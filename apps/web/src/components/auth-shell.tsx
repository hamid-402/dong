"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { Alert } from "@dang/ui";
import { markClientSession, bootstrapDevSession } from "@/lib/api";
import { AuthMark } from "@/components/site/auth-mark";
import { SiteStatusProvider, useSiteStatus } from "@/components/site/marketing-shell";
import { APP_THEMES, useOptionalTheme } from "@/lib/theme";

export { AuthMark };

function AuthThemeSwitch() {
  const themeApi = useOptionalTheme();
  if (!themeApi) return null;
  return (
    <div className="authGate__themes" role="group" aria-label="ظاهر">
      {APP_THEMES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`authGate__theme${themeApi.theme === item.id ? " is-active" : ""}`}
          aria-pressed={themeApi.theme === item.id}
          onClick={() => themeApi.setTheme(item.id)}
        >
          <span
            className="authGate__swatch"
            style={{ background: item.swatch }}
            aria-hidden
          />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function AuthShellFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="authGate">
      <header className="authGate__bar">
        <Link href="/" className="authGate__brand">
          <AuthMark size="sm" />
          <span>دنگ</span>
        </Link>
        <AuthThemeSwitch />
      </header>
      <main id="main" className="authGate__main" tabIndex={-1}>
        <h1>{title}</h1>
        {description ? <p className="authGate__lead">{description}</p> : null}
        {children}
        {footer}
        <p className="authGate__back">
          <Link href="/">بازگشت به سایت</Link>
        </p>
      </main>
    </div>
  );
}

export function AuthShell({
  eyebrow: _eyebrow,
  ...props
}: {
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
  return <p className="authGate__links">{children}</p>;
}

export function AuthDevLink() {
  const { caps } = useSiteStatus();
  const router = useRouter();
  if (!caps?.allowDevAuth) return null;
  return (
    <Link
      href="/spaces/new"
      className="authLayout__devLink"
      onClick={(event) => {
        event.preventDefault();
        markClientSession("dev");
        void bootstrapDevSession()
          .catch(() => undefined)
          .finally(() => {
            router.push("/spaces/new");
          });
      }}
    >
      فقط محیط توسعه
    </Link>
  );
}

export function AuthAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const alertTone = tone === "error" ? "danger" : tone;
  return (
    <Alert tone={alertTone} className="authLayout__alert">
      {children}
    </Alert>
  );
}
