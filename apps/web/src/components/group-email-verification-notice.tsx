"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@dang/ui";
import { api } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

const MESSAGE =
  "برای ساخت گروه و ثبت یا نهایی‌کردن هزینه و تسویه در فضای گروهی، ابتدا ایمیل حساب را تأیید کنید.";

/**
 * Shown only when this environment enforces email verification and the signed-in
 * account is still unverified. Personal spaces do not pass `active`.
 */
export function GroupEmailVerificationNotice({ active }: { active: boolean }) {
  const chrome = useAppChrome();
  const required = chrome.capabilities?.requireEmailVerification === true;
  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || !required) return;
    let cancelled = false;
    void api.profile().then(
      (profile) => {
        if (cancelled) return;
        setEmail(profile.email ?? null);
        setVerified(profile.emailVerified);
      },
      () => {
        if (!cancelled) setVerified(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, required]);

  if (!active || !required || verified !== false) return null;

  function onResend() {
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.resendVerification();
          setError(null);
          setDebugUrl(result.debugVerifyUrl ?? null);
          setInfo(
            result.debugVerifyUrl
              ? "لینک تأیید (حالت توسعه) آماده است."
              : "ایمیل تأیید دوباره فرستاده شد.",
          );
        } catch (err: unknown) {
          setInfo(null);
          setDebugUrl(null);
          setError(err instanceof Error ? err.message : "ارسال ایمیل تأیید ناموفق بود");
        }
      })();
    });
  }

  return (
    <div role="status">
      <p>{MESSAGE}</p>
      {email ? (
        <Button type="button" variant="ghost" size="sm" onClick={onResend} disabled={pending}>
          ارسال مجدد ایمیل تأیید
        </Button>
      ) : null}
      {debugUrl ? <a href={debugUrl}>باز کردن لینک تأیید</a> : null}
      {info ? <p>{info}</p> : null}
      {error ? <p>{error}</p> : null}
    </div>
  );
}
