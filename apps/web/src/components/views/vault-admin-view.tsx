"use client";

import { useEffect, useState, useTransition } from "react";
import type { UserProfile, VaultStatusResponse } from "@dang/contracts";
import { Button } from "@dang/ui";
import {
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
} from "@/components/ui-blocks";
import { RouteErrorState } from "@/components/shell/route-error-state";
import { api, ApiError } from "@/lib/api";
import { authErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";

export function VaultAdminView() {
  const chrome = useAppChrome();
  const [, setProfile] = useState<UserProfile | null>(null);
  const [gate, setGate] = useState<"loading" | "ok" | "404">("loading");
  const [status, setStatus] = useState<VaultStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const vaultLive =
    chrome.capabilities?.providers?.secrets === "local_vault_v1";

  function loadStatus() {
    startTransition(() => {
      void (async () => {
        try {
          const next = await api.vaultStatus();
          setStatus(next);
          setError(null);
        } catch (err: unknown) {
          if (err instanceof ApiError && err.status === 404) {
            setGate("404");
            return;
          }
          setError(authErrorMessage(err, "بارگذاری وضعیت گاوصندوق ناموفق بود"));
        }
      })();
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!vaultLive) {
          if (!cancelled) setGate("404");
          return;
        }
        const p = await api.profile();
        if (cancelled) return;
        if (p.platformRole !== "platform_owner") {
          setGate("404");
          return;
        }
        setProfile(p);
        setGate("ok");
        loadStatus();
      } catch {
        if (!cancelled) setGate("404");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultLive]);

  if (gate === "loading") {
    return <EmptyHint loading>در حال بررسی دسترسی…</EmptyHint>;
  }
  if (gate === "404") {
    return (
      <RouteErrorState
        code="404"
        title="یافت نشد"
        description="این صفحه فقط برای platform_owner و وقتی local vault زنده است در دسترس است."
      />
    );
  }

  return (
    <div className="productPage">
      <FlashMessages error={error} successMessage={successMessage} />
      <ProductGrid>
        <SectionCard title="عملیات مهر و master">
          <FormStack>
            <p>
              نسخهٔ master: {status?.masterKeyVersion ?? "—"} · پنجرهٔ قبلی:{" "}
              {status?.previousMasterKeyLoaded ? "بله" : "خیر"}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <Button
                type="button"
                disabled={pending || status?.status === "sealed"}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        setStatus(await api.vaultSeal());
                        setSuccessMessage("گاوصندوق مهر شد");
                        setError(null);
                      } catch (err: unknown) {
                        setError(authErrorMessage(err, "مهر کردن ناموفق بود"));
                      }
                    })();
                  });
                }}
              >
                مهر کردن (seal)
              </Button>
              <Button
                type="button"
                disabled={pending || status?.status === "unsealed"}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        setStatus(await api.vaultUnseal());
                        setSuccessMessage("گاوصندوق باز شد");
                        setError(null);
                      } catch (err: unknown) {
                        setError(authErrorMessage(err, "باز کردن ناموفق بود"));
                      }
                    })();
                  });
                }}
              >
                باز کردن (unseal)
              </Button>
              <Button
                type="button"
                disabled={pending || status?.status !== "unsealed"}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        const result = await api.vaultRotateMaster();
                        setSuccessMessage(
                          `master به نسخهٔ ${result.masterKeyVersion} چرخید (${result.rewrappedCount} DEK)`,
                        );
                        loadStatus();
                        setError(null);
                      } catch (err: unknown) {
                        setError(authErrorMessage(err, "چرخش master ناموفق بود"));
                      }
                    })();
                  });
                }}
              >
                چرخش master
              </Button>
            </div>
          </FormStack>
        </SectionCard>
        <SectionCard title="نام‌های محرمانه (بدون مقدار)">
          {!status?.secrets.length ? (
            <EmptyHint>هنوز محرمانه‌ای ثبت نشده است.</EmptyHint>
          ) : (
            <ul>
              {status.secrets.map((s) => (
                <li key={s.name} style={{ marginBottom: "0.75rem" }}>
                  <code>{s.name}</code> — v{s.latestVersion} · mk
                  {s.masterKeyVersion} · {s.updatedAt}
                  <div>
                    <Button
                      type="button"
                      disabled={pending || status.status !== "unsealed"}
                      onClick={() => {
                        startTransition(() => {
                          void (async () => {
                            try {
                              const rotated = await api.vaultRotateSecret(s.name);
                              setSuccessMessage(
                                `${rotated.name} از v${rotated.previousVersion} به v${rotated.version}`,
                              );
                              loadStatus();
                              setError(null);
                            } catch (err: unknown) {
                              setError(
                                authErrorMessage(err, "چرخش محرمانه ناموفق بود"),
                              );
                            }
                          })();
                        });
                      }}
                    >
                      چرخش نسخه
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </ProductGrid>
    </div>
  );
}
