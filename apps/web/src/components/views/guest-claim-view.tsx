"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthMeResponse, SystemCapabilities } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { AuthAlert, AuthLinkRow, AuthShell } from "@/components/auth-shell";
import { EmptyHint, FormStack, StatusLine } from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import { wPath } from "@/lib/workspace-paths";

/**
 * Claim a guest placeholder via `?token=` — remaps ledger/expenses to the signed-in user.
 * Additive to invite accept; does not replace `/invite`.
 */
function GuestClaimInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams?.get("token")?.trim() ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [subject, setSubject] = useState(DEV_IDENTITY_DEFAULTS.subject);
  const [displayName, setDisplayName] = useState(DEV_IDENTITY_DEFAULTS.displayName);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [allowDevAuth, setAllowDevAuth] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
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
  const canClaim = hasSession || allowDevAuth;

  function onClaim() {
    if (!token.trim()) {
      setError("توکن claim لازم است");
      return;
    }
    if (!canClaim) {
      setError("برای تصاحب جایگاه مهمان ابتدا وارد شوید.");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          if (allowDevAuth && !hasSession) {
            setDevIdentity(
              subject.trim() || "guest-claim-dev",
              displayName.trim() || "مهمان",
            );
          }
          setError(null);
          const result = await api.claimGuestPlaceholder({
            claimToken: token.trim(),
            idempotencyKey: newClientId(),
          });
          setMessage(
            `جایگاه «${result.placeholder.displayName}» تصاحب شد` +
              (result.remappedExpenseCount || result.remappedLedgerLineCount
                ? ` · خرج‌ها: ${result.remappedExpenseCount} · دفتر: ${result.remappedLedgerLineCount}`
                : ""),
          );
          const ws = await api.getWorkspace(result.placeholder.workspaceId).catch(() => null);
          if (ws?.slug) {
            window.setTimeout(() => {
              router.push(wPath(ws.slug, "space"));
            }, 1200);
          }
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "تصاحب جایگاه مهمان ناموفق"));
        }
      })();
    });
  }

  return (
    <AuthShell
      title="تصاحب جایگاه مهمان"
      description="با توکن لینک claim وارد فضای گروهی شوید"
    >
      {!sessionReady ? (
        <EmptyHint>در حال بررسی نشست…</EmptyHint>
      ) : (
        <FormStack>
          {message ? <StatusLine>{message}</StatusLine> : null}
          {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
          <TextField
            label="توکن claim"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {!hasSession && allowDevAuth ? (
            <>
              <TextField
                label="شناسه موقت (dev)"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <TextField
                label="نام نمایشی"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </>
          ) : null}
          {!canClaim ? (
            <AuthLinkRow>
              <a href={`/login?next=${encodeURIComponent(`/invite/guest-claim?token=${encodeURIComponent(token)}`)}`}>
                ورود
              </a>
            </AuthLinkRow>
          ) : null}
          <Button
            type="button"
            disabled={pending || !token.trim() || !canClaim}
            onClick={onClaim}
          >
            تصاحب جایگاه
          </Button>
        </FormStack>
      )}
    </AuthShell>
  );
}

export function GuestClaimView() {
  return (
    <Suspense fallback={<p className="liveHint">در حال بارگذاری claim…</p>}>
      <GuestClaimInner />
    </Suspense>
  );
}
