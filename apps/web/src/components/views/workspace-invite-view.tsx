"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { CreateInviteResponse, MembershipSummary } from "@dang/contracts";
import { isReadOnlyRole, spaceKindForTemplate } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { hubPathFor } from "@/lib/hub-links";
import { NAV_LABELS } from "@/lib/nav-labels";
import { membershipRoleLabel, spaceKindForTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";

const INVITE_ROLES = new Set(["owner", "admin"]);

export function WorkspaceInviteView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const workspaces = chrome.workspaces;
  const workspaceId = scope?.workspaceId || chrome.workspaceId;
  const [role, setRole] = useState("member");
  const [invitedSubject, setInvitedSubject] = useState("");
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [myRole, setMyRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const identity = getDevIdentity();
    setDevIdentity(identity.subject, identity.displayName);
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setMembers([]);
      setMyRole("");
      return;
    }
    void Promise.all([api.listMembers(workspaceId), api.me()])
      .then(([list, me]) => {
        setMembers(list);
        setMyRole(list.find((m) => m.userId === me.actor.userId)?.role ?? "");
      })
      .catch((err: unknown) =>
        setError(friendlyErrorMessage(err, "بارگذاری اعضا ناموفق")),
      );
  }, [workspaceId]);

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
          setError(friendlyErrorMessage(err, "ساخت دعوت ناموفق"));
        }
      })();
    });
  }

  const pageError = error ?? chrome.error;
  const selected = workspaces.find((w) => w.id === workspaceId);
  const slug = selected?.slug ?? scope?.slug ?? null;
  const kind = spaceKindForTemplate(selected?.template);
  const spaceHref = slug ? wPath(slug, "space") : hubPathFor("/group");
  const canInvite = INVITE_ROLES.has(myRole);
  const readOnly = isReadOnlyRole(myRole) || (!!myRole && !canInvite);
  const title =
    kind === "org"
      ? "اعضا و دعوت سازمانی"
      : kind === "personal"
        ? "اعضای دفتر شخصی"
        : "اعضا و دعوت گروه";
  const description =
    kind === "org"
      ? "فهرست اعضا و دعوت همکار — فقط owner/admin می‌توانند دعوت بسازند."
      : "فهرست اعضا و دعوت دوست — فقط مالک یا ادمین دعوت می‌سازند.";

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow={NAV_LABELS.invite}
        title={title}
        description={description}
        actions={
          <>
            <Link href={spaceHref}>خانهٔ فضا</Link>
            <Link href="/invite">صفحه پذیرش</Link>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}

      <ProductGrid>
        <SectionCard title="اعضای فعلی" badge={members.length} delayClass="delay1">
          {!chrome.ready ? (
            <EmptyHint>در حال بارگذاری فضاها…</EmptyHint>
          ) : workspaces.length === 0 ? (
            <EmptyHint>
              ابتدا یک فضا بسازید — <Link href="/spaces/new">شروع فضای کاری</Link>
            </EmptyHint>
          ) : members.length === 0 ? (
            <EmptyHint>عضوی بارگذاری نشد.</EmptyHint>
          ) : (
            <DataList>
              {members.map((m) => (
                <DataRow
                  key={m.userId}
                  title={m.displayName}
                  meta={membershipRoleLabel(m.role)}
                />
              ))}
            </DataList>
          )}
          {selected ? (
            <StatusLine>
              {selected.name} · {spaceKindForTemplateLabel(kind)} · نقش شما:{" "}
              {membershipRoleLabel(myRole)}
            </StatusLine>
          ) : null}
        </SectionCard>

        <SectionCard title="ساخت دعوت" delayClass="delay1">
          {readOnly ? (
            <StatusLine>
              {isReadOnlyRole(myRole)
                ? `نقش ${membershipRoleLabel(myRole)} فقط مشاهده دارد — ساخت دعوت فعال نیست.`
                : "فقط مالک یا ادمین می‌توانند دعوت بسازند."}
            </StatusLine>
          ) : (
            <FormStack>
              <p className="liveHint" style={{ marginBottom: 8 }}>
                فضای فعال: <strong>{selected?.name ?? "—"}</strong>
              </p>
              <SelectField
                label="نقش"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="finance">مالی (مادرخرج / پشتیبان)</option>
                <option value="admin">ادمین</option>
                <option value="member">عضو</option>
                <option value="approver">تأییدکننده</option>
                <option value="buyer">خریدار</option>
                <option value="auditor">حسابرس</option>
                <option value="guest">مهمان موقت</option>
              </SelectField>
              <p className="emptyHint" style={{ border: "none", padding: 0, marginTop: -4 }}>
                قانون پشتیبان مادرخرج: تا وقتی دو مدیر مالی فعال نباشد، دعوت با نقش غیرمالی رد
                می‌شود.
              </p>
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
                hint="اگر Resend یا SMTP واقعی فعال باشد، دعوت ایمیل می‌شود"
              />
              <Button onClick={onCreate} disabled={pending || !workspaceId}>
                ساخت دعوت
              </Button>
            </FormStack>
          )}
        </SectionCard>

        {created ? (
          <SectionCard title="نتیجه دعوت" delayClass="delay2">
            <p className="emptyHint" style={{ border: "none", padding: 0 }}>
              <StatusPill tone="ok">دعوت ساخته شد</StatusPill>
              {created.emailDelivered ? " · ایمیل ارسال شد" : null}
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
                {created.debugInviteUrl ?? created.acceptPath}
              </code>
              <Link href={created.acceptPath}>باز کردن لینک پذیرش</Link>
            </FormStack>
          </SectionCard>
        ) : null}
      </ProductGrid>
    </AppShell>
  );
}
