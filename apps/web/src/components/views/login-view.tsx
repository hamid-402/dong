"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthDevLink, AuthDivider, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import { normalizeEmail, validateLoginIdentifier } from "@/lib/auth-validation";
import { authErrorMessage } from "@/lib/api-errors";
import { api, api as apiClient, markClientSession } from "@/lib/api";
import { completeClientAuth, safeAppPath } from "@/lib/auth-session";
import { t } from "@/lib/i18n";

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeAppPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [oidcReady, setOidcReady] = useState(false);
  const loginTitle = t("login.title");
  const loginDescription = challengeId
    ? t("login.mfaDescription")
    : t("login.description");

  useEffect(() => {
    void api
      .oidcStatus()
      .then((s) => setOidcReady(s.configured))
      .catch(() => setOidcReady(false));
  }, []);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (challengeId) {
      const code = mfaCode.trim();
      if (!/^\d{6}$/.test(code)) {
        setMfaError("کد ۶ رقمی را وارد کنید");
        return;
      }
      setMfaError(null);
      startTransition(() => {
        void (async () => {
          try {
            const result = await api.mfaVerify({ challengeId, code });
            completeClientAuth("password", result.actor);
            setFormError(null);
            router.replace(nextPath);
          } catch (err: unknown) {
            setFormError(authErrorMessage(err, "تأیید MFA ناموفق بود"));
          }
        })();
      });
      return;
    }

    const identifier = email.trim();
    const nextEmailError = validateLoginIdentifier(identifier);
    const nextPasswordError = !password ? "رمز عبور را وارد کنید" : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      setFormError(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const body =
            identifier.includes("@")
              ? { email: normalizeEmail(identifier), password }
              : { identifier, password };
          const result = await api.login(body);
          if ("mfaRequired" in result && result.mfaRequired) {
            setChallengeId(result.challengeId);
            setFormError(null);
            return;
          }
          if (!("ok" in result) || !result.ok) {
            setFormError("ورود ناموفق بود");
            return;
          }
          completeClientAuth("password", result.actor);
          setFormError(null);
          router.replace(nextPath);
        } catch (err: unknown) {
          setFormError(authErrorMessage(err, "ورود ناموفق بود"));
        }
      })();
    });
  }

  return (
    <AuthShell
      title={loginTitle}
      description={loginDescription}
      footer={
        <AuthLinkRow>
          <Link href="/forgot-password">{t("login.forgotLink")}</Link>
          <span aria-hidden>·</span>
          <Link href="/register">{t("login.registerLink")}</Link>
          <AuthDevLink />
        </AuthLinkRow>
      }
    >
      {formError ? <AuthAlert tone="error">{formError}</AuthAlert> : null}
      <form onSubmit={onSubmit} className="authLayout__form" noValidate>
        <FormStack>
          {challengeId ? (
            <TextField
              id="login-mfa"
              label={t("login.mfaCode")}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => {
                setMfaCode(e.target.value);
                setMfaError(null);
                setFormError(null);
              }}
              error={mfaError ?? undefined}
              required
            />
          ) : (
            <>
              <TextField
                id="login-email"
                label="ایمیل، نام کاربری یا موبایل"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                  setFormError(null);
                }}
                hint="با ایمیل، نام کاربری یا شماره موبایل وارد شوید"
                error={emailError ?? undefined}
                required
              />
              <div className="authLayout__passwordRow">
                <TextField
                  id="login-password"
                  label={t("login.password")}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                    setFormError(null);
                  }}
                  error={passwordError ?? undefined}
                  required
                />
                <Link href="/forgot-password" className="authLayout__inlineLink">
                  {t("login.forgotLink")}
                </Link>
              </div>
            </>
          )}
          <Button type="submit" disabled={pending} className="authLayout__submit">
            {pending
              ? t("common.loading")
              : challengeId
                ? t("login.mfaSubmit")
                : t("login.submit")}
          </Button>
          {challengeId ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setChallengeId(null);
                setMfaCode("");
                setMfaError(null);
                setFormError(null);
              }}
            >
              بازگشت به ورود
            </Button>
          ) : null}
        </FormStack>
      </form>
      {!challengeId && oidcReady ? (
        <>
          <AuthDivider />
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="authLayout__ssoBtn"
            onClick={() => {
              // Cookie gate only — real actor arrives after OIDC callback.
              markClientSession("oidc");
              window.location.href = apiClient.oidcLoginUrl();
            }}
          >
            <span className="authLayout__ssoIcon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3a5 5 0 0 1 5 5v1h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2V8a5 5 0 0 1 5-5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
            ورود با SSO سازمانی
          </Button>
        </>
      ) : null}
    </AuthShell>
  );
}
