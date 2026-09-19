"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthDevLink, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import {
  normalizeEmail,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePhoneOptional,
  validateUsernameInput,
} from "@/lib/auth-validation";
import { authErrorMessage } from "@/lib/api-errors";
import { api } from "@/lib/api";
import { completeClientAuth, safeAppPath } from "@/lib/auth-session";
import { t } from "@/lib/i18n";

export function RegisterView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeAppPath(searchParams.get("next"));
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [debugVerifyUrl, setDebugVerifyUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    const nextDisplayNameError = validateDisplayName(displayName);
    const nextUsernameError = validateUsernameInput(username);
    const nextEmailError = validateEmail(normalizedEmail);
    const nextPhoneError = validatePhoneOptional(phone);
    const nextPasswordError = validatePassword(password);
    setDisplayNameError(nextDisplayNameError);
    setUsernameError(nextUsernameError);
    setEmailError(nextEmailError);
    setPhoneError(nextPhoneError);
    setPasswordError(nextPasswordError);
    if (
      nextDisplayNameError ||
      nextUsernameError ||
      nextEmailError ||
      nextPhoneError ||
      nextPasswordError
    ) {
      setFormError(null);
      setSuccess(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.register({
            email: normalizedEmail,
            password,
            displayName: displayName.trim(),
            username: username.trim(),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          });
          completeClientAuth("password", result.actor);
          if (result.debugVerifyUrl) {
            setSuccess("حساب ساخته شد. لینک تأیید ایمیل (حالت توسعه) را باز کنید.");
            setDebugVerifyUrl(result.debugVerifyUrl);
            setFormError(null);
            return;
          }
          setFormError(null);
          router.replace(nextPath);
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
      title={t("register.title")}
      description={t("register.description")}
      footer={
        <AuthLinkRow>
          <span>حساب دارید؟</span>
          <Link href={`/login${nextPath !== "/spaces" ? `?next=${encodeURIComponent(nextPath)}` : ""}`}>
            {t("login.submit")}
          </Link>
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
      <form onSubmit={onSubmit} className="authLayout__form" noValidate>
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
            error={displayNameError ?? undefined}
            required
          />
          <TextField
            id="register-username"
            label="نام کاربری"
            autoComplete="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(null);
              setFormError(null);
            }}
            hint="برای پیدا کردن شما توسط دیگران — حروف لاتین، عدد، نقطه و خط‌زیر"
            error={usernameError ?? undefined}
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
            hint="ایمیل واقعی حساب"
            error={emailError ?? undefined}
            required
          />
          <TextField
            id="register-phone"
            label="شماره موبایل (اختیاری)"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError(null);
              setFormError(null);
            }}
            hint="تا اتصال SMS، تأییدشده اعلام نمی‌شود"
            error={phoneError ?? undefined}
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
            hint="حداقل ۱۰ کاراکتر، شامل حرف و عدد (فارسی یا انگلیسی)"
            error={passwordError ?? undefined}
            required
          />
          <Button type="submit" disabled={pending} className="authLayout__submit">
            {pending ? t("common.loading") : t("register.submit")}
          </Button>
          {debugVerifyUrl ? (
            <Button type="button" variant="ghost" onClick={() => router.replace("/spaces")}>
              ادامه به فضاها
            </Button>
          ) : null}
        </FormStack>
      </form>
    </AuthShell>
  );
}
