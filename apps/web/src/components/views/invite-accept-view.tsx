"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import {
  AuthAlert,
  AuthLinkRow,
  AuthShell,
} from "@/components/auth-shell";
import { EmptyHint, FormStack, StatusPill } from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity } from "@/lib/api";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function InviteAcceptView() {
  const [token, setToken] = useState("");
  const [subject, setSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [displayName, setDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setToken(readTokenFromLocation());
    const identity = getDevIdentity();
    setSubject(identity.subject);
    setDisplayName(identity.displayName);
  }, []);

  function onAccept() {
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(subject.trim() || "invitee-dev", displayName.trim() || "مدعو");
          const workspace = await api.acceptInvite(token.trim());
          setMessage(`عضویت در «${workspace.name}» ثبت شد.`);
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
          setMessage(null);
        }
      })();
    });
  }

  return (
    <AuthShell
      eyebrow="دعوت"
      title="پیوستن به فضای کاری"
      description="توکن دعوت را وارد کنید یا از لینک دعوت بازشده استفاده کنید."
      footer={
        <AuthLinkRow>
          <Link href="/login">ورود</Link>
          <span aria-hidden>·</span>
          <Link href="/register">ساخت حساب</Link>
        </AuthLinkRow>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      <FormStack>
        <TextField
          label="شناسه محلی مدعو"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <TextField
          label="نام نمایشی"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <TextField
          label="توکن دعوت"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <Button onClick={onAccept} disabled={pending || !token.trim()}>
          پذیرش دعوت
        </Button>
      </FormStack>
      {message ? (
        <p className="emptyHint" style={{ border: "none", padding: 0 }}>
          <StatusPill tone="ok">{message}</StatusPill>
        </p>
      ) : !token.trim() ? (
        <EmptyHint>توکن را از لینک دعوت بگیرید یا دستی وارد کنید.</EmptyHint>
      ) : null}
    </AuthShell>
  );
}
