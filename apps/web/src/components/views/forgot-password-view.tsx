"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import { validateEmail } from "@/lib/auth-validation";
import { api } from "@/lib/api";

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.forgotPassword(email);
          setMessage("اگر این ایمیل ثبت شده باشد، لینک بازیابی ارسال می‌شود.");
          setDebugUrl(result.debugResetUrl ?? null);
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطا");
          setMessage(null);
        }
      })();
    });
  }

  return (
    <AuthShell
      title="فراموشی رمز عبور"
      description="لینک یک‌بارمصرف حدود یک ساعت معتبر است."
      footer={
        <AuthLinkRow>
          <Link href="/login">بازگشت به ورود</Link>
        </AuthLinkRow>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {debugUrl ? (
        <AuthAlert tone="info">
          حالت توسعه — <a href={debugUrl}>بازیابی رمز</a>
        </AuthAlert>
      ) : null}
      <form onSubmit={onSubmit} className="authLayout__form">
        <FormStack>
          <TextField
            id="forgot-email"
            label="ایمیل"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" disabled={pending} className="authLayout__submit">
            {pending ? "در حال ارسال…" : "ارسال لینک"}
          </Button>
        </FormStack>
      </form>
    </AuthShell>
  );
}
