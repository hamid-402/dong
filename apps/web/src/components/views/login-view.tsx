"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthDevLink, AuthDivider, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import { validateEmail } from "@/lib/auth-validation";
import { authErrorMessage } from "@/lib/api-errors";
import { api, setDevIdentity, markClientSession, api as apiClient } from "@/lib/api";

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/hub";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [oidcReady, setOidcReady] = useState(false);

  useEffect(() => {
    void api
      .oidcStatus()
      .then((s) => setOidcReady(s.configured))
      .catch(() => setOidcReady(false));
  }, []);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextEmailError = validateEmail(email);
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
          const result = await api.login({ email, password });
          markClientSession("password");
          setDevIdentity(result.actor.externalSubject, result.actor.displayName);
          setFormError(null);
          router.push(nextPath);
        } catch (err: unknown) {
          setFormError(authErrorMessage(err, "ورود ناموفق بود"));
        }
      })();
    });
  }

  return (
    <AuthShell
      title="ورود به حساب"
      description="با ایمیل و رمز وارد شوید."
      footer={
        <AuthLinkRow>
          <Link href="/forgot-password">فراموشی رمز</Link>
          <span aria-hidden>·</span>
          <Link href="/register">ساخت حساب جدید</Link>
          <AuthDevLink />
        </AuthLinkRow>
      }
    >
      {formError ? <AuthAlert tone="error">{formError}</AuthAlert> : null}
      <form onSubmit={onSubmit} className="authLayout__form">
        <FormStack>
          <TextField
            id="login-email"
            label="ایمیل"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
              setFormError(null);
            }}
            hint={emailError ?? undefined}
            aria-invalid={emailError ? true : undefined}
            required
          />
          <div className="authLayout__passwordRow">
            <TextField
              id="login-password"
              label="رمز عبور"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
                setFormError(null);
              }}
              hint={passwordError ?? undefined}
              aria-invalid={passwordError ? true : undefined}
              required
            />
            <Link href="/forgot-password" className="authLayout__inlineLink">
              فراموش کردید؟
            </Link>
          </div>
          <Button type="submit" disabled={pending} className="authLayout__submit">
            {pending ? "در حال ورود…" : "ورود"}
          </Button>
        </FormStack>
      </form>
      {oidcReady ? (
        <>
          <AuthDivider />
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="authLayout__ssoBtn"
            onClick={() => {
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
