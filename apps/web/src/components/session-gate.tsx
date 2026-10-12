"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  api,
  bootstrapDevSession,
  clearClientSession,
  isExplicitDevAuthMode,
  markClientSession,
} from "@/lib/api";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { t } from "@/lib/i18n";

/** Soft verify — don't block the shell for long when the API is cold. */
const SESSION_CHECK_MS = 2_500;

class SessionCheckTimeoutError extends Error {
  constructor() {
    super("session-check-timeout");
    this.name = "SessionCheckTimeoutError";
  }
}

function sessionCheckTimeout(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer = 0;
  const promise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new SessionCheckTimeoutError()), ms);
  });
  return {
    promise,
    cancel: () => window.clearTimeout(timer),
  };
}

/**
 * Client-side session verification (additive to middleware cookie check).
 * Middleware requires HttpOnly dang_session; this verifies the actor.
 * DevAuth bootstrap runs only for an explicit dev client, and a slow API
 * must not clear that client mode or send the user to login.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<"checking" | "slow" | "ready">("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = sessionCheckTimeout(SESSION_CHECK_MS);

    void (async () => {
      const goLogin = () => {
        clearClientSession();
        const next = encodeURIComponent(pathname || "/home");
        router.replace(`/login?next=${next}`);
      };

      try {
        const session = await Promise.race([
          (async () => {
            if (isExplicitDevAuthMode()) {
              try {
                await bootstrapDevSession();
              } catch {
                /* CSRF or network — session() still decides. */
              }
            }
            return api.session();
          })(),
          timeout.promise,
        ]);
        timeout.cancel();
        if (cancelled) return;
        if (!session.actor) {
          goLogin();
          return;
        }
        const serverMode = session.actor.authMode;
        if (serverMode === "password" || serverMode === "oidc") {
          markClientSession(serverMode);
        } else {
          markClientSession("dev");
        }
        setPhase("ready");
      } catch (error) {
        timeout.cancel();
        if (cancelled) return;
        if (error instanceof SessionCheckTimeoutError) {
          setPhase("slow");
          return;
        }
        goLogin();
      }
    })();

    return () => {
      cancelled = true;
      timeout.cancel();
    };
    // `attempt` is the retry signal. Path and router are read from the
    // render that started this check so hub navigation does not refetch.
  }, [attempt]);

  if (phase === "slow") {
    return (
      <div className="app-viewport" style={{ padding: "1.25rem 1rem", width: "100%" }}>
        <p role="status">{t("sessionGate.slow")}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          {t("sessionGate.retry")}
        </button>
      </div>
    );
  }

  if (phase !== "ready") {
    return (
      <div className="app-viewport" style={{ padding: "1.25rem 1rem", width: "100%" }}>
        <ContentSkeleton rows={4} label={t("sessionGate.checking")} />
      </div>
    );
  }

  return <>{children}</>;
}
