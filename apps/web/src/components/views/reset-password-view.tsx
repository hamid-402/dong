"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import { validatePassword } from "@/lib/auth-validation";
import { api, markClientSession, setDevIdentity } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError("توکن بازیابی را وارد کنید");
      return;
    }
    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.resetPassword(token, password);
          markClientSession("password");
          setDevIdentity(result.actor.externalSubject, result.actor.displayName);
          setError(null);
          router.push("/hub");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "بازیابی ناموفق بود");
        }
      })();
    });
  }

  return (
    <form onSubmit={onSubmit} className="authLayout__form">
      <FormStack>
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
        <TextField
          id="reset-token"
          label="توکن بازیابی"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <TextField
          id="reset-password"
          label="رمز جدید"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="حداقل ۱۰ کاراکتر، شامل حرف و عدد"
          required
        />
        <Button type="submit" disabled={pending} className="authLayout__submit">
          {pending ? "در حال ذخیره…" : "تنظیم رمز جدید"}
        </Button>
      </FormStack>
    </form>
  );
}

export function ResetPasswordView() {
  return (
    <AuthShell
      title="بازیابی رمز عبور"
      description="پس از تنظیم رمز، نشست‌های قبلی باطل می‌شوند."
      footer={
        <AuthLinkRow>
          <Link href="/login">ورود</Link>
        </AuthLinkRow>
      }
    >
      <Suspense fallback={<p className="emptyHint">…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
