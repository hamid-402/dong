"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { AuthMeResponse, SystemCapabilities } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import {
  AuthAlert,
  AuthLinkRow,
  AuthShell,
} from "@/components/auth-shell";
import { EmptyHint, FormStack, StatusPill } from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { wPath } from "@/lib/workspace-paths";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

function inviteReturnPath(token: string): string {
  const q = token.trim() ? `?token=${encodeURIComponent(token.trim())}` : "";
  return `/invite${q}`;
}

export function InviteAcceptView() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [subject, setSubject] = useState(DEV_IDENTITY_DEFAULTS.subject);
  const [displayName, setDisplayName] = useState(DEV_IDENTITY_DEFAULTS.displayName);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [allowDevAuth, setAllowDevAuth] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setToken(readTokenFromLocation());
    const identity = getDevIdentity();
    setSubject(identity.subject);
    setDisplayName(identity.displayName);
    let cancelled = false;
    void (async () => {
      try {
        const caps = await api.capabilities().catch(() => null as SystemCapabilities | null);
        if (cancelled) return;
        setAllowDevAuth(Boolean(caps?.allowDevAuth));
        try {
          const session = await api.me();
          if (!cancelled) setMe(session);
        } catch {
          if (!cancelled) setMe(null);
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasSession = Boolean(me?.actor?.userId);
  const canAccept = hasSession || allowDevAuth;

  function onAccept() {
    if (!token.trim()) return;
    if (!canAccept) {
      setError("برای پذیرش دعوت ابتدا وارد شوید یا حساب بسازید.");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          if (allowDevAuth && !hasSession) {
            setDevIdentity(subject.trim() || "invitee-dev", displayName.trim() || "مدعو");
          }
          const workspace = await api.acceptInvite(token.trim());
          setMessage(`عضویت در «${workspace.name}» ثبت شد.`);
          setError(null);
          router.replace(wPath(workspace.slug));
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "پذیرش دعوت ناموفق بود"));
          setMessage(null);
        }
      })();
    });
  }

  const returnPath = inviteReturnPath(token);
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;
  const registerHref = `/register?next=${encodeURIComponent(returnPath)}`;

  return (
    <AuthShell
      eyebrow="دعوت"
      title="پیوستن به فضای کاری"
      description={
        hasSession
          ? `به‌عنوان ${me?.actor.displayName ?? "کاربر واردشده"} دعوت را بپذیرید.`
          : "توکن دعوت را از لینک بگیرید؛ برای پذیرش باید وارد شوید."
      }
      footer={
        <AuthLinkRow>
          <Link href={loginHref}>ورود</Link>
          <span aria-hidden>·</span>
          <Link href={registerHref}>ساخت حساب</Link>
        </AuthLinkRow>
      }
    >
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

      {!sessionReady ? (
        <EmptyHint loading>در حال بررسی نشست…</EmptyHint>
      ) : (
        <FormStack>
          {hasSession ? (
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              نشست فعال: {me!.actor.displayName}
            </p>
          ) : allowDevAuth ? (
            <>
              <p className="liveHint">
                حالت توسعه: می‌توانید با هویت محلی بپذیرید، یا از ورود واقعی استفاده کنید.
              </p>
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
            </>
          ) : (
            <p className="liveHint">
              نشست فعالی نیست. ابتدا{" "}
              <Link href={loginHref}>وارد شوید</Link> یا{" "}
              <Link href={registerHref}>حساب بسازید</Link>؛ سپس به همین صفحه برمی‌گردید.
            </p>
          )}

          <TextField
            label="توکن دعوت"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <Button
            onClick={onAccept}
            disabled={pending || !token.trim() || !canAccept}
          >
            {pending ? "در حال پذیرش…" : "پذیرش دعوت"}
          </Button>
        </FormStack>
      )}

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
