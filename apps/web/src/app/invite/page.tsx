"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export default function InviteAcceptPage() {
  const chrome = useAppChrome();
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

  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="دعوت"
        title="پیوستن به فضای کاری"
        description="توکن دعوت را وارد کنید یا از لینک دعوت بازشده استفاده کنید."
        actions={
          <>
            <Link href="/onboarding">ساخت فضای کاری</Link>
            <Link href="/workspaces/invite">ساخت دعوت</Link>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}

      <ProductGrid>
        <SectionCard title="پذیرش دعوت" delayClass="delay1">
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
        </SectionCard>
      </ProductGrid>
    </AppShell>
  );
}
