"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  ExpenseSummary,
  MembershipSummary,
  WorkspaceSubunitSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import {
  isMembershipManagerRole,
  isReadOnlyRole,
  personaHomeSpec,
  spaceKindForTemplate,
} from "@dang/contracts";
import { Button, formatMoneyFromIrrMinor } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import {
  SpaceHomeActivity,
  SpaceHomeActions,
  SpaceHomeKeyNumber,
  SpaceHomeLayout,
  spaceHomeKeyLabel,
  spaceHomePrimaryCta,
  type SpaceHomeActionItem,
  type SpaceHomeActivityItem,
} from "@/components/views/space-home";
import { spaceHomeStyles } from "@/components/views/space-home/space-home-layout";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { expenseHrefForUnit } from "@/lib/expense-unit-href";
import { hubPathFor } from "@/lib/hub-links";
import {
  expenseStatusLabel,
  membershipRoleLabel,
} from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { modulesForTemplate } from "@/lib/workspace-modules";
import { wPath } from "@/lib/workspace-paths";

const HOME_UNIT = "toman" as const;
const UNIT_LABEL = "تومان";

/** Org / team home — SpaceHomeLayout; deep tools live on section menu routes. */
export function OrgSpaceView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const { successMessage, error, setError } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [subunits, setSubunits] = useState<WorkspaceSubunitSummary[]>([]);
  const [approvalCount, setApprovalCount] = useState(0);
  const [myRole, setMyRole] = useState<string>("");

  const flags = chrome.capabilities?.productFlags;

  async function refresh(workspaceId: string) {
    const actorId = chrome.actor?.userId;
    const [memberList, expenseList, subunitList, me, queue] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.listSubunits(workspaceId).catch(() => [] as WorkspaceSubunitSummary[]),
      actorId ? Promise.resolve(null) : api.me(),
      flags?.approvalQueue
        ? api.listApprovalQueue(workspaceId).catch(() => [])
        : Promise.resolve([]),
    ]);
    const userId = actorId ?? me!.actor.userId;
    setMembers(memberList);
    setExpenses(expenseList);
    setSubunits(subunitList);
    setApprovalCount(queue.length);
    const role = memberList.find((m) => m.userId === userId)?.role ?? "";
    setMyRole(role);
    setWorkspace(chrome.workspaces.find((w) => w.id === workspaceId) ?? null);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    const scoped = scope?.workspaceId
      ? chrome.workspaces.find((w) => w.id === scope.workspaceId) ?? null
      : chrome.workspaces.find((w) => w.id === chrome.workspaceId) ?? null;
    const isOrg = scoped && spaceKindForTemplate(scoped.template) === "org";
    if (!isOrg || !scoped) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setSubunits([]);
      setApprovalCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh(scoped.id)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [
    chrome.ready,
    chrome.workspaceId,
    chrome.workspaces,
    scope?.workspaceId,
    chrome.actor?.userId,
    flags?.approvalQueue,
  ]);

  const canManageMembers = isMembershipManagerRole(myRole) && !isReadOnlyRole(myRole);
  const readOnly = isReadOnlyRole(myRole);
  const pageError = error ?? chrome.error;
  const slug = workspace?.slug ?? scope?.slug ?? null;
  const approvalsHref = slug ? wPath(slug, "approvals") : hubPathFor("/workspaces");
  const subunitsHref = slug ? wPath(slug, "subunits") : "/home?kind=org";
  const procurementHref = slug
    ? wPath(slug, "procurement")
    : hubPathFor("/workspaces/procurement");
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const modules = modulesForTemplate(workspace?.template);
  const homeSpec = personaHomeSpec(myRole, "org", {
    approvalQueue: Boolean(flags?.approvalQueue),
    statementsLive:
      chrome.capabilities?.providers?.statements === "csv_json_print_v1",
    procurement: modules.has("procurement"),
    partners: modules.has("partnerships"),
  });

  const primary = spaceHomePrimaryCta("org", { canProcure: modules.has("procurement") });
  const primaryHref =
    primary.prefer === "procurement" ? procurementHref : slug ? wPath(slug, "record") : "/home";

  const actionItems = useMemo((): SpaceHomeActionItem[] => {
    const items: SpaceHomeActionItem[] = [];
    if (approvalCount > 0) {
      items.push({
        id: "approvals",
        title: "تأیید در صف",
        detail: `${approvalCount.toLocaleString("fa-IR")} مورد`,
        href: approvalsHref,
        actionLabel: "بررسی",
      });
    }
    const openNeeds = expenses.filter(
      (e) => e.status === "draft" || e.status === "submitted",
    );
    for (const expense of openNeeds.slice(0, 4)) {
      items.push({
        id: expense.id,
        title: expense.title,
        detail: expenseStatusLabel(expense.status),
        href: `${expensesHref}?expense=${encodeURIComponent(expense.id)}#expense-inspector`,
        actionLabel: "مشاهده",
      });
    }
    return items.slice(0, 5);
  }, [approvalCount, approvalsHref, expenses, expensesHref]);

  const activityItems = useMemo((): SpaceHomeActivityItem[] => {
    return expenses.slice(0, 5).map((expense) => ({
      id: expense.id,
      title: expense.title,
      detail: `${expenseStatusLabel(expense.status)} · ${formatMoneyFromIrrMinor(expense.total.amountMinor, HOME_UNIT)} ${UNIT_LABEL}`,
      href: `${expensesHref}?expense=${encodeURIComponent(expense.id)}#expense-inspector`,
    }));
  }, [expenses, expensesHref]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame title="" state="ready">
        {pageError ? <p className="liveError">{pageError}</p> : null}
        {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

        {loading ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری…" />
        ) : !workspace ? (
          <SectionCard title="سازمانی ندارید" delayClass="delay1">
            <EmptyHint>
              هنوز فضای تیمی/شرکتی ندارید. از «ساخت فضا» قالب تیم یا شرکای پروژه را بسازید.
            </EmptyHint>
            <FormStack>
              <Link href="/spaces/new?kind=org">
                <Button type="button">ساخت فضای سازمانی</Button>
              </Link>
            </FormStack>
          </SectionCard>
        ) : (
          <SpaceHomeLayout
            title={workspace.name}
            roleBadge={myRole ? membershipRoleLabel(myRole) : null}
            primaryAction={
              !readOnly && slug ? (
                <Link href={primaryHref} className="dang-btn dang-btn--md dang-btn--primary">
                  {primary.label}
                </Link>
              ) : undefined
            }
            secondaryAction={
              approvalCount > 0 ? (
                <Link href={approvalsHref} className="dang-btn dang-btn--md dang-btn--ghost">
                  صف تأیید
                </Link>
              ) : null
            }
            keyNumber={
              <SpaceHomeKeyNumber
                label={spaceHomeKeyLabel("org", "settled")}
                amount={
                  approvalCount > 0
                    ? `${approvalCount.toLocaleString("fa-IR")} تأیید باز`
                    : "صف تأیید خالی"
                }
                tone={approvalCount > 0 ? "debt" : "settled"}
                meta={
                  <span>
                    {members.filter((m) => !m.disabledAt).length.toLocaleString("fa-IR")} عضو
                    {" · "}
                    {subunits.length.toLocaleString("fa-IR")} بخش
                  </span>
                }
              />
            }
            actions={<SpaceHomeActions items={actionItems} />}
            activity={<SpaceHomeActivity items={activityItems} />}
            extras={
              <>
                {homeSpec?.panels.subunits !== false ? (
                  <SectionCard
                    title="بخش‌ها و شرکت‌های زیرمجموعه"
                    badge={subunits.length}
                    delayClass="delay1"
                  >
                    {subunits.length === 0 ? (
                      <EmptyHint>
                        {canManageMembers
                          ? "هنوز بخش یا شرکت زیرمجموعه‌ای نیست — ساختار را از مسیر بخش‌ها بسازید."
                          : "هنوز بخش یا شرکت زیرمجموعه‌ای نیست."}
                      </EmptyHint>
                    ) : (
                      <DataList>
                        {subunits.slice(0, 8).map((s) => (
                          <DataRow
                            key={s.id}
                            title={`${s.code} · ${s.name}`}
                            meta={`${s.kind === "subsidiary" ? "شرکت زیرمجموعه" : "بخش"} · ${s.memberUserIds.length.toLocaleString("fa-IR")} نفر`}
                            actions={
                              homeSpec?.canAddExpense !== false ? (
                                <Link href={expenseHrefForUnit(expensesHref, s.code, s.name)}>
                                  <Button type="button" variant="ghost">
                                    ثبت خرج
                                  </Button>
                                </Link>
                              ) : null
                            }
                          />
                        ))}
                      </DataList>
                    )}
                    <Link href={subunitsHref} className="textButton">
                      {canManageMembers ? "مدیریت ساختار" : "مشاهدهٔ ساختار"}
                    </Link>
                  </SectionCard>
                ) : null}
                {slug ? (
                  <details className={spaceHomeStyles.collapsedExtra}>
                    <summary>شناسهٔ عمومی فضا</summary>
                    <GroupPublicIdCard slug={slug} name={workspace.name} />
                  </details>
                ) : null}
              </>
            }
          />
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
