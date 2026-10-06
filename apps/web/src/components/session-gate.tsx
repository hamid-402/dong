"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  api,
  bootstrapDevSession,
  clearClientSession,
  getAuthClientMode,
  markClientSession,
} from "@/lib/api";
import { ContentSkeleton } from "@/components/shell/content-skeleton";

/** Soft verify — don't block the shell for long when the API is cold. */
const SESSION_CHECK_MS = 2_500;

/**
 * Client-side session verification (additive to middleware cookie check).
 * Middleware requires HttpOnly dang_session; this verifies actor and boots
 * DevAuth session when needed. Web-only cookie is never enough to stay in.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const goLogin = () => {
        clearClientSession();
        const next = encodeURIComponent(pathname || "/home");
        router.replace(`/login?next=${next}`);
      };

      try {
        if (getAuthClientMode() === "dev") {
          try {
            await bootstrapDevSession();
          } catch {
            /* allow session() below to decide */
          }
        }

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
        goLogin();
      } catch {
        if (cancelled) return;
        goLogin();
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
      <div className="app-viewport" style={{ padding: "1.25rem 1rem", width: "100%" }}>
        <ContentSkeleton rows={4} label="در حال بررسی نشست…" />
      </div>
    );
  }

  return <>{children}</>;
}
