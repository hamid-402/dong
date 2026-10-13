"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@dang/ui";
import { AuthAlert, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import { api } from "@/lib/api";

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  function verify(nextToken: string) {
    startTransition(() => {
      void (async () => {
        try {
          const profile = await api.verifyEmail(nextToken);
          setMessage(`ایمیل ${profile.email ?? ""} تأیید شد.`);
          setError(null);
          router.replace("/home");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "تأیید ناموفق");
        }
      })();
    });
  }

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify(token);
  }, [token]);

  return (
    <FormStack>
      {!token ? <AuthAlert tone="info">توکن تأیید در URL نیست.</AuthAlert> : null}
      {token && pending ? <p role="status">در حال تأیید…</p> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {error ? (
        <>
          <AuthAlert tone="error">{error}</AuthAlert>
          <Button type="button" disabled={pending} onClick={() => verify(token)}>
            تلاش دوباره
          </Button>
        </>
      ) : null}
    </FormStack>
  );
}

export function VerifyEmailView() {
  return (
    <AuthShell
      title="تأیید ایمیل"
      description="اگر لینک توکن داشته باشد، ایمیل همان لحظه تأیید می‌شود."
      footer={
        <AuthLinkRow>
          <Link href="/login">ورود</Link>
        </AuthLinkRow>
      }
    >
      <Suspense fallback={<p role="status">در حال تأیید…</p>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
