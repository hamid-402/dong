"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { isFinanceManagerRole } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import {
  permissionsApi,
  type AccessGrantDto,
  type PolicyAuditDto,
  type WorkspacePermissionsDto,
} from "@/lib/api/permissions";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { membershipRoleLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";

const EDITABLE_ROLES = ["admin", "finance", "deputy_finance", "member", "approver", "buyer"];

export function WorkspacePermissionsView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const workspaceId = scope?.workspaceId || chrome.workspaceId;
  const [data, setData] = useState<WorkspacePermissionsDto | null>(null);
  const [policyAudit, setPolicyAudit] = useState<PolicyAuditDto | null>(null);
  const [policyAuditError, setPolicyAuditError] = useState<string | null>(null);
  const [role, setRole] = useState("member");
  const [action, setAction] = useState("invite.create");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");
  const [deputyUserId, setDeputyUserId] = useState("");
  const [deputyReason, setDeputyReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [myRole, setMyRole] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<string | null>(null);
  const [dryRunEnabled, setDryRunEnabled] = useState(false);
  const [dryUserId, setDryUserId] = useState("");
  const [dryAction, setDryAction] = useState("expense.create");
  const [dryAmountToman, setDryAmountToman] = useState("");
  const [dryResult, setDryResult] = useState<string | null>(null);
  const [memberOptions, setMemberOptions] = useState<
    Array<{ userId: string; displayName: string }>
  >([]);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      try {
        const [caps, me, members] = await Promise.all([
          api.capabilities(),
          api.me(),
          api.listMembers(workspaceId),
        ]);
        setAccessPolicy(caps.providers?.accessPolicy ?? null);
        setDryRunEnabled(caps.providers?.permissionsDryRun === "dry_run_v1");
        const roleNow = members.find((m) => m.userId === me.actor.userId)?.role ?? "";
        setMyRole(roleNow);
        setMemberOptions(
          members
            .filter((m) => !m.disabledAt)
            .map((m) => ({ userId: m.userId, displayName: m.displayName })),
        );
        if (!dryUserId && members[0]) setDryUserId(members[0].userId);
        if (caps.providers?.accessPolicy === "rbac_abac_grants_v1") {
          setData(await permissionsApi.get(workspaceId));
        } else {
          setData(null);
        }
        if (roleNow === "owner" || roleNow === "admin" || roleNow === "auditor") {
          try {
            setPolicyAudit(await permissionsApi.getPolicyAudit(workspaceId));
            setPolicyAuditError(null);
          } catch (err: unknown) {
            setPolicyAudit(null);
            setPolicyAuditError(friendlyErrorMessage(err, "بارگذاری سیاست‌ها ناموفق"));
          }
        } else {
          setPolicyAudit(null);
          setPolicyAuditError(null);
        }
        setError(null);
      } catch (err: unknown) {
        setError(friendlyErrorMessage(err, "بارگذاری دسترسی‌ها ناموفق"));
      }
    })();
  }, [workspaceId]);

  const canEdit = myRole === "owner";
  const canDeputy = isFinanceManagerRole(myRole) || myRole === "owner";

  function refresh() {
    if (!workspaceId) return;
    startTransition(() => {
      void permissionsApi
        .get(workspaceId)
        .then(setData)
        .catch((err: unknown) => setError(friendlyErrorMessage(err, "بارگذاری ناموفق")));
    });
  }

  function saveRoleGrant() {
    if (!workspaceId || !canEdit) return;
    const existing =
      data?.roleGrants
        .filter((g) => g.role === role && g.action !== action)
        .map((g) => ({ action: g.action, effect: g.effect })) ?? [];
    const grants: AccessGrantDto[] = [...existing, { action, effect }];
    startTransition(() => {
      void permissionsApi
        .putRoleGrants(workspaceId, role, grants)
        .then(() => refresh())
        .catch((err: unknown) => setError(friendlyErrorMessage(err, "ذخیره ناموفق")));
    });
  }

  function createDeputy() {
    if (!workspaceId || !canDeputy || !deputyUserId.trim()) return;
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    startTransition(() => {
      void permissionsApi
        .createDeputyWindow(workspaceId, {
          userId: deputyUserId.trim(),
          startsAt,
          endsAt,
          reason: deputyReason.trim() || "جانشینی موقت",
        })
        .then(() => {
          setDeputyUserId("");
          setDeputyReason("");
          refresh();
        })
        .catch((err: unknown) => setError(friendlyErrorMessage(err, "ایجاد بازه ناموفق")));
    });
  }

  function revoke(windowId: string) {
    if (!workspaceId || !canDeputy) return;
    startTransition(() => {
      void permissionsApi
        .revokeDeputyWindow(workspaceId, windowId)
        .then(() => refresh())
        .catch((err: unknown) => setError(friendlyErrorMessage(err, "لغو ناموفق")));
    });
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
      title={NAV_LABELS.permissions}
      description={"grant نقش و جانشینی از accessPolicy واقعی."}
      primaryAction={scope?.slug ? <Link href={wPath(scope.slug, "members")}>{NAV_LABELS.members}</Link> : <Link href="/spaces">{NAV_LABELS.spacesList}</Link>}
      state="ready"
    >
      <SectionCard title="سطح دسترسی قابل‌ویرایش" badge={accessPolicy ?? "—"}>
        {error ? <StatusLine>{error}</StatusLine> : null}
        {!accessPolicy ? (
          <ContentSkeleton rows={2} label="در حال خواندن capabilities…" />
        ) : accessPolicy !== "rbac_abac_grants_v1" ? (
          <EmptyHint>
            این استقرار grant قابل‌ویرایش را گزارش نکرده ({accessPolicy}).
          </EmptyHint>
        ) : !data ? (
          <EmptyHint>داده‌ای نیست یا دسترسی ندارید.</EmptyHint>
        ) : (
          <>
            <p>
              نقش شما: {membershipRoleLabel(myRole)}. اقدام‌های قفل‌شده قابل واگذاری نیستند (
              {data.lockedActions.length} مورد).
            </p>
            {canEdit ? (
              <FormStack>
                <SelectField
                  label="نقش"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {EDITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {membershipRoleLabel(r)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="اقدام"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {data.grantableActions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="اثر"
                  value={effect}
                  onChange={(e) => setEffect(e.target.value as "allow" | "deny")}
                >
                  <option value="allow">اجازه</option>
                  <option value="deny">منع</option>
                </SelectField>
                <Button type="button" disabled={pending} onClick={saveRoleGrant}>
                  ذخیره grant نقش
                </Button>
              </FormStack>
            ) : (
              <EmptyHint>فقط مالک می‌تواند grant نقش را ویرایش کند.</EmptyHint>
            )}
            <SectionCard title="grantهای نقش فعلی" badge={data.roleGrants.length}>
              {data.roleGrants.length === 0 ? (
                <EmptyHint>هنوز grant سفارشی ثبت نشده — سیاست پیش‌فرض RBAC/ABAC برقرار است.</EmptyHint>
              ) : (
                <DataList>
                  {data.roleGrants.map((g) => (
                    <DataRow
                      key={`${g.role}-${g.action}`}
                      title={`${membershipRoleLabel(g.role)} · ${g.action}`}
                      meta={g.effect === "allow" ? "اجازه" : "منع"}
                    />
                  ))}
                </DataList>
              )}
            </SectionCard>
            <SectionCard title="جانشین مالی" badge={data.deputyWindows.length}>
              {canDeputy ? (
                <FormStack>
                  <TextField
                    label="شناسه کاربر (UUID)"
                    value={deputyUserId}
                    onChange={(e) => setDeputyUserId(e.target.value)}
                  />
                  <TextField
                    label="دلیل"
                    value={deputyReason}
                    onChange={(e) => setDeputyReason(e.target.value)}
                  />
                  <Button type="button" disabled={pending} onClick={createDeputy}>
                    بازه ۷روزه بساز
                  </Button>
                </FormStack>
              ) : null}
              {data.deputyWindows.length === 0 ? (
                <EmptyHint>بازهٔ جانشینی فعالی ثبت نشده.</EmptyHint>
              ) : (
                <DataList>
                  {data.deputyWindows.map((w) => (
                    <DataRow
                      key={w.id}
                      title={w.userId}
                      meta={`${w.active ? "فعال" : "غیرفعال"} · ${w.reason || "—"}`}
                      actions={
                        canDeputy && !w.revokedAt ? (
                          <Button type="button" disabled={pending} onClick={() => revoke(w.id)}>
                            لغو
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </DataList>
              )}
            </SectionCard>
          </>
        )}
      </SectionCard>

      {myRole === "owner" || myRole === "admin" || myRole === "auditor" ? (
        <SectionCard
          title="ممیزی سیاست‌های داخلی (Policy DSL)"
          badge={policyAudit ? String(policyAudit.policies.length) : "—"}
        >
          {policyAuditError ? <StatusLine>{policyAuditError}</StatusLine> : null}
          {!policyAudit && !policyAuditError ? (
            <ContentSkeleton rows={2} label="در حال خواندن policy-audit…" />
          ) : null}
          {policyAudit ? (
            <>
              <p>
                منبع: {policyAudit.source} · نقش شما:{" "}
                {membershipRoleLabel(policyAudit.actorRole)} — فقط رجیستری built-in؛ grant
                سفارشی اینجا نیست.
              </p>
              <DataList>
                {policyAudit.policies.map((p) => (
                  <DataRow
                    key={p.policyId}
                    title={`${p.action} · ${p.effect}`}
                    meta={`${p.roleOnlyAllows ? "نقش به‌تنهایی اجازه می‌دهد" : "نقش به‌تنهایی کافی نیست"} · ${p.noteForActor}`}
                  />
                ))}
              </DataList>
            </>
          ) : null}
        </SectionCard>
      ) : null}

      {dryRunEnabled && (myRole === "owner" || myRole === "admin" || myRole === "auditor") ? (
        <SectionCard title="Dry-run دسترسی (بدون تغییر)">
          <FormStack>
            <SelectField
              label="عضو"
              value={dryUserId}
              onChange={(e) => setDryUserId(e.target.value)}
            >
              {memberOptions.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </SelectField>
            <TextField
              label="action"
              value={dryAction}
              onChange={(e) => setDryAction(e.target.value)}
              dir="ltr"
              hint="مثلاً expense.create یا invite.create"
            />
            <TextField
              label="مبلغ (تومان، اختیاری)"
              value={dryAmountToman}
              onChange={(e) => setDryAmountToman(e.target.value)}
              dir="ltr"
            />
            <Button
              type="button"
              disabled={pending || !workspaceId || !dryUserId || !dryAction.trim()}
              onClick={() => {
                if (!workspaceId) return;
                startTransition(() => {
                  void (async () => {
                    try {
                      const toman = Number(dryAmountToman.replaceAll(",", ""));
                      const result = await permissionsApi.dryRun(workspaceId, {
                        userId: dryUserId,
                        action: dryAction.trim(),
                        amountMinor:
                          Number.isFinite(toman) && toman > 0
                            ? String(Math.round(toman) * 10)
                            : undefined,
                      });
                      setDryResult(
                        `${result.allowed ? "مجاز" : "غیرمجاز"} · ${result.reason}` +
                          (result.matched
                            ? ` · ${result.matched.source}/${result.matched.effect}`
                            : ""),
                      );
                      setError(null);
                    } catch (err: unknown) {
                      setDryResult(null);
                      setError(friendlyErrorMessage(err, "dry-run ناموفق"));
                    }
                  })();
                });
              }}
            >
              ارزیابی
            </Button>
            {dryResult ? <StatusLine>{dryResult}</StatusLine> : null}
          </FormStack>
        </SectionCard>
      ) : null}
    
      </WorkspacePageFrame></AppShell>
  );
}
