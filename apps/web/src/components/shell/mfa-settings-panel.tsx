"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import type { MfaSetupResponse, UserProfile } from "@dang/contracts";
import { AuthAlert } from "@/components/auth-shell";
import { MfaQrCode } from "@/components/shell/mfa-qr-code";
import { FormStack, SectionCard, StatusLine, StatusPill } from "@/components/ui-blocks";
import { api, ApiError, type SystemCapabilities } from "@/lib/api";

type Props = {
  profile: UserProfile | null;
  onProfileChange: (profile: UserProfile) => void;
};

/**
 * MFA management — only interactive when capabilities.mfa is true (no fake UI).
 */
export function MfaSettingsPanel({ profile, onProfileChange }: Props) {
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      try {
        setCaps(await api.capabilities());
      } catch {
        setCaps(null);
      }
    })();
  }, []);

  const mfaAvailable = caps?.mfa === true;

  if (caps === null) {
    return (
      <SectionCard title="تأیید دو مرحله‌ای (MFA)" tone="quiet">
        <p className="liveHint">در حال بررسی قابلیت MFA…</p>
      </SectionCard>
    );
  }

  if (!mfaAvailable) {
    return (
      <SectionCard title="تأیید دو مرحله‌ای (MFA)" tone="quiet">
        <StatusLine>
          MFA روی این استقرار فعال نیست
          {caps.stubs ? " (یا هنوز در capabilities گزارش نشده)." : "."}
        </StatusLine>
      </SectionCard>
    );
  }

  function startSetup() {
    setError(null);
    setInfo(null);
    startTransition(() => {
      void (async () => {
        try {
          const next = await api.mfaSetup();
          setSetup(next);
          setInfo("رمز را در اپ Authenticator اسکن کنید، سپس کد ۶ رقمی را وارد کنید.");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "شروع MFA ناموفق");
        }
      })();
    });
  }

  function confirmSetup() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError("کد باید ۶ رقم باشد");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.mfaConfirm({ code: code.trim() });
          onProfileChange(result.profile);
          setCode("");
          setInfo("MFA فعال شد. کدهای بازیابی را در جای امن نگه دارید — دیگر نمایش داده نمی‌شوند.");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "تأیید MFA ناموفق");
        }
      })();
    });
  }

  function disableMfa() {
    if (!password || !/^\d{6}$/.test(disableCode.trim())) {
      setError("رمز عبور و کد ۶ رقمی لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.mfaDisable({ password, code: disableCode.trim() });
          const next = await api.profile();
          onProfileChange(next);
          setPassword("");
          setDisableCode("");
          setSetup(null);
          setInfo("MFA غیرفعال شد");
          setError(null);
        } catch (err: unknown) {
          setError(
            err instanceof ApiError ? err.message : err instanceof Error ? err.message : "غیرفعال‌سازی ناموفق",
          );
        }
      })();
    });
  }

  return (
    <SectionCard title="تأیید دو مرحله‌ای (MFA)" tone="quiet">
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}

      <StatusLine>
        وضعیت:{" "}
        <StatusPill tone={profile?.mfaEnabled ? "ok" : "warn"}>
          {profile?.mfaEnabled ? "فعال" : "غیرفعال"}
        </StatusPill>
        {profile?.mfaEnrollmentRequired ? " · برای نقش‌های حساس توصیه می‌شود" : null}
      </StatusLine>

      {profile?.mfaEnabled ? (
        <FormStack density="compact">
          <TextField
            id="mfa-disable-password"
            label="رمز عبور"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="برای غیرفعال‌سازی MFA"
          />
          <TextField
            id="mfa-disable-code"
            label="کد ۶ رقمی Authenticator"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            aria-describedby="mfa-disable-hint"
          />
          <p id="mfa-disable-hint" className="liveHint">
            کد فعلی اپ Authenticator را وارد کنید.
          </p>
          <Button type="button" variant="secondary" onClick={disableMfa} disabled={pending}>
            غیرفعال‌سازی MFA
          </Button>
        </FormStack>
      ) : (
        <FormStack density="compact">
          {!setup ? (
            <Button type="button" onClick={startSetup} disabled={pending}>
              شروع فعال‌سازی MFA
            </Button>
          ) : (
            <>
              <MfaQrCode otpauthUrl={setup.otpauthUrl} />
              <p>
                Secret (دستی): <code dir="ltr">{setup.secret}</code>
              </p>
              <div>
                <p className="profileFormBlock__label">کدهای بازیابی (یک‌بار نمایش)</p>
                <ul dir="ltr">
                  {setup.recoveryCodes.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <TextField
                id="mfa-confirm-code"
                label="کد تأیید ۶ رقمی"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button type="button" onClick={confirmSetup} disabled={pending}>
                تأیید و فعال‌سازی
              </Button>
            </>
          )}
        </FormStack>
      )}
    </SectionCard>
  );
}
