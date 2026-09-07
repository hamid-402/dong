"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { CreateInviteResponse, WorkspaceSummary } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";
import { hubPathFor } from "@/lib/hub-links";
import { wPath } from "@/lib/workspace-paths";

export function WorkspaceInviteView() {
  const chrome = useAppChrome();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [role, setRole] = useState("member");
  const [invitedSubject, setInvitedSubject] = useState("");
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = getDevIdentity();
        setDevIdentity(identity.subject, identity.displayName);
        const list = await api.listWorkspaces();
        if (cancelled) return;
        setWorkspaces(list);
        setWorkspaceId(list[0]?.id ?? "");
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onCreate() {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const invite = await api.createInvite(workspaceId, {
            role: role as CreateInviteResponse["role"],
            invitedSubject: invitedSubject || undefined,
          });
          setCreated(invite);
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }

  const pageError = error ?? chrome.error;
  const selected = workspaces.find((w) => w.id === workspaceId);
  const slug = selected?.slug ?? null;
  const groupHref = slug ? wPath(slug, "space") : hubPathFor("/group");

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="اعضا"
        title="دعوت دوست به گروه"
        description="ایمیل یا شناسه دوست را وارد کنید؛ لینک دعوت بسازید و در صورت تنظیم ایمیل، خودکار ارسال می‌شود."
        actions={
          <>
            <Link href={groupHref}>گروه و دوستان</Link>
            <Link href="/invite">صفحه پذیرش</Link>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}

      <ProductGrid>
        <SectionCard title="ساخت دعوت" delayClass="delay1">
          {workspaces.length === 0 ? (
            <EmptyHint>
              ابتدا یک فضا بسازید — <Link href="/spaces/new">شروع فضای کاری</Link>
            </EmptyHint>
          ) : null}
          <FormStack>
            <SelectField
              label="فضای کاری"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              {workspaces.length === 0 ? (
                <option value="">ابتدا یک فضا بسازید</option>
              ) : (
                workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))
              )}
            </SelectField>
            <SelectField
              label="نقش"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="member">عضو</option>
              <option value="finance">مالی (مادرخرج)</option>
              <option value="approver">تأییدکننده</option>
              <option value="buyer">خریدار</option>
              <option value="admin">ادمین</option>
              <option value="auditor">حسابرس</option>
            </SelectField>
            {role === "finance" ? (
              <p className="emptyHint" style={{ border: "none", padding: 0, marginTop: -4 }}>
                مادرخرج می‌تواند صورتحساب بسازد، تسویه را تأیید کند و دوره‌های مالی را ببندد —
                برای نقش‌های حساس فعال‌سازی MFA توصیه می‌شود.
              </p>
            ) : null}
            <TextField
              label="شناسه/ایمیل مدعو (اختیاری)"
              value={invitedSubject}
              onChange={(event) => setInvitedSubject(event.target.value)}
            />
            <Button onClick={onCreate} disabled={pending || !workspaceId}>
              ساخت دعوت
            </Button>
          </FormStack>
        </SectionCard>

        {created ? (
          <SectionCard title="نتیجه دعوت" delayClass="delay2">
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              <StatusPill tone="ok">دعوت ساخته شد</StatusPill>
            </p>
            <FormStack>
              <code
                style={{
                  display: "block",
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--surface-2)",
                  wordBreak: "break-all",
                }}
              >
                {created.token}
              </code>
              <Link href={created.acceptPath}>باز کردن لینک پذیرش</Link>
            </FormStack>
          </SectionCard>
        ) : null}
      </ProductGrid>
    </AppShell>
  );
}
