"use client";

import { useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import type { MfaSetupResponse, UserProfile } from "@dang/contracts";
import { AuthAlert } from "@/components/auth-shell";
import { MfaQrCode } from "@/components/shell/mfa-qr-code";
import { FormStack, SectionCard, StatusLine, StatusPill } from "@/components/ui-blocks";
import { api, ApiError } from "@/lib/api";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { t } from "@/lib/i18n";

type Props = {
  profile: UserProfile | null;
  onProfileChange: (profile: UserProfile) => void;
};

/**
 * MFA management — only interactive when capabilities.mfa is true (no fake UI).
 */
export function MfaSettingsPanel({ profile, onProfileChange }: Props) {
  const chrome = useOptionalAppChrome();
  const caps = chrome?.capabilities ?? null;
  const capsReady = Boolean(chrome?.ready);
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mfaAvailable = caps?.mfa === true;

  if (!capsReady) {
    return (
      <SectionCard title={t("shell.mfaTitle")} tone="quiet">
        <p className="liveHint">{t("shell.mfaChecking")}</p>
      </SectionCard>
    );
  }

  if (!mfaAvailable) {
    return (
      <SectionCard title={t("shell.mfaTitle")} tone="quiet">
        <StatusLine>{t("shell.mfaUnavailable")}</StatusLine>
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
          setInfo(t("shell.mfaScanHint"));
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t("shell.mfaStartFail"));
        }
      })();
    });
  }

  function confirmSetup() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t("shell.mfaCodeSix"));
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.mfaConfirm({ code: code.trim() });
          onProfileChange(result.profile);
          setCode("");
          setInfo(t("shell.mfaEnabledInfo"));
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t("shell.mfaConfirmFail"));
        }
      })();
    });
  }

  function disableMfa() {
    if (!password || !/^\d{6}$/.test(disableCode.trim())) {
      setError(t("shell.mfaNeedPasswordCode"));
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
          setInfo(t("shell.mfaDisabledInfo"));
          setError(null);
        } catch (err: unknown) {
          setError(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : t("shell.mfaDisableFail"),
          );
        }
      })();
    });
  }

  return (
    <SectionCard title={t("shell.mfaTitle")} tone="quiet">
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}

      <StatusLine>
        {t("shell.mfaStatus")}{" "}
        <StatusPill tone={profile?.mfaEnabled ? "ok" : "warn"}>
          {profile?.mfaEnabled ? t("shell.mfaOn") : t("shell.mfaOff")}
        </StatusPill>
        {profile?.mfaEnrollmentRequired ? t("shell.mfaSensitiveHint") : null}
      </StatusLine>

      {profile?.mfaEnabled ? (
        <FormStack density="compact">
          <TextField
            id="mfa-disable-password"
            label={t("shell.mfaPassword")}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={t("shell.mfaDisableHint")}
          />
          <TextField
            id="mfa-disable-code"
            label={t("shell.mfaAuthenticatorCode")}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            aria-describedby="mfa-disable-hint"
          />
          <p id="mfa-disable-hint" className="liveHint">
            {t("shell.mfaDisableCodeHint")}
          </p>
          <Button type="button" variant="secondary" onClick={disableMfa} disabled={pending}>
            {t("shell.mfaDisableBtn")}
          </Button>
        </FormStack>
      ) : (
        <FormStack density="compact">
          {!setup ? (
            <Button type="button" onClick={startSetup} disabled={pending}>
              {t("shell.mfaStartEnable")}
            </Button>
          ) : (
            <>
              <MfaQrCode otpauthUrl={setup.otpauthUrl} />
              <p>
                {t("shell.mfaSecretManual")} <code dir="ltr">{setup.secret}</code>
              </p>
              <div>
                <p className="profileFormBlock__label">{t("shell.mfaRecoveryOnce")}</p>
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
                label={t("shell.mfaConfirmCode")}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button type="button" onClick={confirmSetup} disabled={pending}>
                {t("shell.mfaConfirmBtn")}
              </Button>
            </>
          )}
        </FormStack>
      )}
    </SectionCard>
  );
}
