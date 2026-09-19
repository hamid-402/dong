"use client";

import { useEffect, useState } from "react";
import type {
  PlatformOutboxStatsResponse,
  PlatformSloResponse,
  UserProfile,
} from "@dang/contracts";
import {
  EmptyHint,
  ProductGrid,
  SectionCard,
} from "@/components/ui-blocks";
import { RouteErrorState } from "@/components/shell/route-error-state";
import { api, ApiError } from "@/lib/api";
import { authErrorMessage } from "@/lib/api-errors";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { useAppChrome } from "@/lib/use-app-chrome";
import { t } from "@/lib/i18n";

function isPlatformRole(role: UserProfile["platformRole"] | undefined): boolean {
  return role === "platform_owner" || role === "platform_support";
}

function fmtBurn(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

export function PlatformSloView() {
  const chrome = useAppChrome();
  const [gate, setGate] = useState<"loading" | "ok" | "404">("loading");
  const [slo, setSlo] = useState<PlatformSloResponse | null>(null);
  const [outbox, setOutbox] = useState<PlatformOutboxStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sloLive = chrome.capabilities?.providers?.slo === "in_app_v1";
  const platformLive =
    chrome.capabilities?.providers?.platformAdmin === "platform_v1";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!platformLive || !sloLive) {
          if (!cancelled) setGate("404");
          return;
        }
        const p = await api.profile();
        if (cancelled) return;
        if (!isPlatformRole(p.platformRole)) {
          setGate("404");
          return;
        }
        const [snap, outboxSnap] = await Promise.all([
          api.slo(),
          api.outboxStats().catch(() => null),
        ]);
        if (cancelled) return;
        setSlo(snap);
        setOutbox(outboxSnap);
        setGate("ok");
        setError(null);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          if (!cancelled) setGate("404");
          return;
        }
        if (!cancelled) {
          setGate("404");
          setError(authErrorMessage(err, "خواندن SLO ناموفق بود"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platformLive, sloLive]);

  if (gate === "loading") {
    return <EmptyHint loading>در حال بررسی دسترسی…</EmptyHint>;
  }
  if (gate === "404") {
    return (
      <RouteErrorState
        code="404"
        title={t("error.notFound.title")}
        description={error ?? t("error.notFound.description")}
      />
    );
  }

  return (
    <div className="productPage">

      {!slo ? (
        <EmptyHint>هنوز اسنپ‌شات SLO بارگذاری نشده است.</EmptyHint>
      ) : (
        <ProductGrid>
          <SectionCard title={t("platform.outbox.title")}>
            {outbox?.stats == null ? (
              <EmptyHint>{t("platform.outbox.unavailable")}</EmptyHint>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li>persistence: {outbox.persistence}</li>
                <li>pending: {outbox.stats.pendingCount}</li>
                <li>failed pending: {outbox.stats.failedPendingCount}</li>
                <li>
                  oldest pending age (ms):{" "}
                  {outbox.stats.oldestPendingAgeMs == null
                    ? "—"
                    : String(outbox.stats.oldestPendingAgeMs)}
                </li>
              </ul>
            )}
          </SectionCard>
          {slo.windows.map((win) => (
            <SectionCard
              key={win.id}
              title={t("platform.slo.window", { id: win.id })}
              description={
                win.breached
                  ? "حداقل یک سیگنال در دسترس نقض آستانه دارد"
                  : "بدون نقض روی سیگنال‌های در دسترس"
              }
            >
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {win.signals.map((sig) => (
                  <li
                    key={sig.id}
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--border, #ddd)",
                    }}
                  >
                    <div>
                      <strong>{sig.id}</strong>
                      {" · "}
                      {sig.available ? (
                        <>
                          burn {fmtBurn(sig.burnRate)} / {sig.threshold}
                          {sig.breached ? " · نقض" : ""}
                        </>
                      ) : (
                        <>
                          {t("platform.slo.unavailable", {
                            reason: sig.unavailableReason ?? "—",
                          })}
                        </>
                      )}
                    </div>
                    {sig.available && Object.keys(sig.observed).length > 0 ? (
                      <div style={{ fontSize: "0.85em", opacity: 0.8 }}>
                        {Object.entries(sig.observed)
                          .map(([k, v]) => `${k}=${v ?? "null"}`)
                          .join(" · ")}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}

          {slo.notes && slo.notes.length > 0 ? (
            <SectionCard title="یادداشت‌های صادقانه">
              <ul>
                {slo.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p style={{ fontSize: "0.85em", opacity: 0.8 }}>
                تولید: {formatFaDateTime(slo.generatedAt)}
              </p>
            </SectionCard>
          ) : null}
        </ProductGrid>
      )}
    </div>
  );
}
