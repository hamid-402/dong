"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearClientSession, getAuthClientMode, markClientSession } from "@/lib/api";

const SESSION_CHECK_MS = 8_000;
const WEB_SESSION_COOKIE = "dang_web_session";

function hasWebSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${WEB_SESSION_COOKIE}=1`));
}

/**
 * Client-side session verification (additive to middleware cookie check).
 * Runs once per mount — not on every pathname change (that caused extra latency).
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      /* raced via Promise.race below */
    }, SESSION_CHECK_MS);

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
        // Password/OIDC already set dang_web_session; don't bounce if cookie probe is slow.
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
        // Dev mode (or timed-out/unavailable session probe): enter shell;
        // subsequent API calls still authenticate via x-dang-* headers.
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
      } finally {
        window.clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
