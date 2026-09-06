"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearClientSession, getAuthClientMode, markClientSession } from "@/lib/api";

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
    void (async () => {
      try {
        const session = await api.session();
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
        clearClientSession();
        const next = encodeURIComponent(pathname || "/hub");
        router.replace(`/login?next=${next}`);
      } catch {
        if (cancelled) return;
        if (getAuthClientMode() === "dev") {
          markClientSession("dev");
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
