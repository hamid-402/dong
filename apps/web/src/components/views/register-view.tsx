"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthDevLink, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-validation";
import { authErrorMessage } from "@/lib/api-errors";
import { api, setDevIdentity, markClientSession } from "@/lib/api";

export function RegisterView() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [debugVerifyUrl, setDebugVerifyUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextDisplayNameError = validateDisplayName(displayName);
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setDisplayNameError(nextDisplayNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextDisplayNameError || nextEmailError || nextPasswordError) {
      setFormError(null);
      setSuccess(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.register({ email, password, displayName });
          markClientSession("password");
          setDevIdentity(result.actor.externalSubject, result.actor.displayName);
          if (result.debugVerifyUrl) {
            setSuccess("حساب ساخته شد. لینک تأیید ایمیل (حالت توسعه) را باز کنید.");
            setDebugVerifyUrl(result.debugVerifyUrl);
            setFormError(null);
            return;
          }
          setFormError(null);
          router.push("/hub");
        } catch (err: unknown) {
          setSuccess(null);
          setDebugVerifyUrl(null);
          setFormError(authErrorMessage(err, "ثبت‌نام ناموفق بود"));
        }
      })();
    });
  }

  return (
    <AuthShell
      title="ثبت‌نام"
      description="رمز حداقل ۱۰ کاراکتر و شامل حرف و عدد باشد."
      footer={
        <AuthLinkRow>
          <span>حساب دارید؟</span>
          <Link href="/login">ورود</Link>
          <AuthDevLink />
        </AuthLinkRow>
      }
    >
      {formError ? <AuthAlert tone="error">{formError}</AuthAlert> : null}
      {success ? <AuthAlert tone="success">{success}</AuthAlert> : null}
      {debugVerifyUrl ? (
        <AuthAlert tone="info">
          <a href={debugVerifyUrl}>تأیید ایمیل</a>
        </AuthAlert>
      ) : null}
      <form onSubmit={onSubmit} className="authLayout__form">
        <FormStack>
          <TextField
            id="register-display-name"
            label="نام نمایشی"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDisplayNameError(null);
              setFormError(null);
            }}
            hint={displayNameError ?? undefined}
            aria-invalid={displayNameError ? true : undefined}
            required
          />
          <TextField
            id="register-email"
            label="ایمیل"
            type="email"
            autoComplete="email"
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
          <TextField
            id="register-password"
            label="رمز عبور"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(null);
              setFormError(null);
            }}
            hint={
              passwordError ??
              "حداقل ۱۰ کاراکتر، شامل حرف و عدد (فارسی یا انگلیسی)"
            }
            aria-invalid={passwordError ? true : undefined}
            required
          />
          <Button type="submit" disabled={pending} className="authLayout__submit">
            {pending ? "در حال ساخت…" : "ساخت حساب"}
          </Button>
          {debugVerifyUrl ? (
            <Button type="button" variant="ghost" onClick={() => router.push("/hub")}>
              ادامه به داشبورد
            </Button>
          ) : null}
        </FormStack>
      </form>
    </AuthShell>
  );
}
