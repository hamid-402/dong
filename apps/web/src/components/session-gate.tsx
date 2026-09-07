"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearClientSession, getAuthClientMode, markClientSession } from "@/lib/api";
import { WEB_SESSION_COOKIE, WEB_SESSION_COOKIE_VALUE } from "@dang/contracts";

/** Soft verify — don't block the shell for long when the API is cold. */
const SESSION_CHECK_MS = 2_500;

function hasWebSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim() === `${WEB_SESSION_COOKIE}=${WEB_SESSION_COOKIE_VALUE}`);
}

function canEnterShellOptimistically(): boolean {
  const mode = getAuthClientMode();
  if (mode === "dev") return true;
  if ((mode === "password" || mode === "oidc") && hasWebSessionCookie()) return true;
  return false;
}

/**
 * Client-side session verification (additive to middleware cookie check).
 * Optimistic: show shell immediately when cookie/dev mode is present, verify in background.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (canEnterShellOptimistically()) {
      if (getAuthClientMode() === "dev") markClientSession("dev");
      setReady(true);
    }

    void (async () => {
      try {
        const session = await Promise.race([
          api.session(),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error("session-check-timeout")),
              SESSION_CHECK_MS,
            );
          }),
        ]);
        if (cancelled) return;
        if (session.actor) {
          const mode = getAuthClientMode();
          markClientSession(mode === "dev" ? "dev" : mode);
          setReady(true);
          return;
        }
        if (getAuthClientMode() === "dev" && session.mode === "dev") {
          markClientSession("dev");
          setReady(true);
          return;
        }
        if (
          (getAuthClientMode() === "password" || getAuthClientMode() === "oidc") &&
          hasWebSessionCookie()
        ) {
          setReady(true);
          return;
        }
        clearClientSession();
        const next = encodeURIComponent(pathname || "/spaces");
        router.replace(`/login?next=${next}`);
      } catch {
        if (cancelled) return;
        if (getAuthClientMode() === "dev") {
          markClientSession("dev");
          setReady(true);
          return;
        }
        if (
          (getAuthClientMode() === "password" || getAuthClientMode() === "oidc") &&
          hasWebSessionCookie()
        ) {
          setReady(true);
          return;
        }
        clearClientSession();
        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally once: middleware already guards routes; re-checking on every
    // hub navigation doubled session round-trips and felt like a heavy app.
  }, []);

  if (!ready) {
    return (
      <div className="app-viewport" style={{ padding: 24 }}>
        <p className="liveHint">در حال بررسی نشست…</p>
      </div>
    );
  }

  return <>{children}</>;
}
