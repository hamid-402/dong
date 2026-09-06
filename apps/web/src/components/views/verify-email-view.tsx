"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Button } from "@dang/ui";
import { AuthAlert, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { FormStack } from "@/components/ui-blocks";
import { api } from "@/lib/api";

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function verify(token: string) {
    startTransition(() => {
      void (async () => {
        try {
          const profile = await api.verifyEmail(token);
          setMessage(`ایمیل ${profile.email ?? ""} تأیید شد.`);
          setError(null);
          router.push("/profile");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "تأیید ناموفق");
        }
      })();
    });
  }

  const token = params.get("token") ?? "";
  return (
    <FormStack>
      {token ? (
        <Button type="button" disabled={pending} onClick={() => verify(token)}>
          {pending ? "در حال تأیید…" : "تأیید ایمیل"}
        </Button>
      ) : (
        <AuthAlert tone="info">توکن تأیید در URL نیست.</AuthAlert>
      )}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
    </FormStack>
  );
}

export function VerifyEmailView() {
  return (
    <AuthShell
      title="تأیید ایمیل"
      description="لینک تأیید را از ایمیل باز کنید یا دکمه زیر را بزنید."
      footer={
        <AuthLinkRow>
          <Link href="/login">ورود</Link>
        </AuthLinkRow>
      }
    >
      <Suspense fallback={<p className="emptyHint">…</p>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
