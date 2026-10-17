"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ExpenseSummary,
  MembershipSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import {
  isFinanceManagerRole,
  isMembershipManagerRole,
  isReadOnlyRole,
  personaHomeSpec,
} from "@dang/contracts";
import {
  Button,
  ErrorState,
  formatMoneyFromIrrMinor,
  irrMinorToDisplayInteger,
  LoadingState,
  TextField,
} from "@dang/ui";
import { CreateGroupForm } from "@/components/create-group-form";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import { EmptyHint, FormStack, SectionCard } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { canonicalHref } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { membershipRoleLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyUnitSuffix } from "@/lib/money-labels";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { GroupSetupChecklist } from "@/components/shell/group-setup-checklist";
import {
  SpaceHomeActivity,
  SpaceHomeActions,
  SpaceHomeKeyNumber,
  SpaceHomeLayout,
  spaceHomeKeyLabel,
  type SpaceHomeActionItem,
  type SpaceHomeActivityItem,
} from "@/components/views/space-home";
import { spaceHomeStyles } from "@/components/views/space-home/space-home-layout";
import { netFromIrrMinor, sortPeersByAbsNet } from "@/lib/space-net-balance";
import { expenseStatusLabel } from "@/lib/status-labels";

/**
 * Kind space home for friends/household groups (`/w/…/space`).
 * Shares SpaceHomeLayout with /w/<slug>; full modules live on section menu routes.
 */
export function FriendsGroupView() {
  const chrome = useAppChrome();
  const displayUnit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(displayUnit);
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [openSettlementCount, setOpenSettlementCount] = useState(0);
  const [outingTitle, setOutingTitle] = useState("");
  const [outingBudgetToman, setOutingBudgetToman] = useState("");
  const [outingEndsOn, setOutingEndsOn] = useState("");
  const [outings, setOutings] = useState<
    Array<{
      id: string;
      title: string;
      total: { amountMinor: string };
      expenseIds: string[];
      budgetCapMinor?: string;
    }>
  >([]);
  const [pending, startTransition] = useTransition();
  const [actorUserId, setActorUserId] = useState<string | null>(null);

  const slug =
    workspace?.slug ??
    chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.slug ??
    null;
  const expensesHref = canonicalHref("expenses", slug);
  const settlementsHref = canonicalHref("settlements", slug);
  const statementsLive =
    chrome.capabilities?.providers?.statements === "csv_json_print_v1";
  const myRole = members.find((m) => m.userId === actorUserId)?.role;
  const readOnlySpace = isReadOnlyRole(myRole);
  const homeSpec = personaHomeSpec(myRole, "group", {
    approvalQueue: Boolean(chrome.capabilities?.productFlags?.approvalQueue),
    statementsLive,
  });
  const canAdd = homeSpec ? homeSpec.canAddExpense : !readOnlySpace;

  async function refresh(workspaceId: string) {
    const [memberList, expenseList, balanceData, outingList, settlementList] =
      await Promise.all([
        api.listMembers(workspaceId),
        api.listExpenses(workspaceId),
        api.getBalances(workspaceId),
        api.listOutings(workspaceId).catch(() => []),
        api.listSettlements(workspaceId).catch(() => []),
      ]);
    const current = chrome.workspaces.find((item) => item.id === workspaceId) ?? null;
    setWorkspace((prev) => current ?? (prev?.id === workspaceId ? prev : null));
    setMembers(memberList);
    setExpenses(expenseList);
    setBalances(balanceData);
    setOutings(outingList);
    setOpenSettlementCount(
      settlementList.filter((s) => s.status === "claimed" || s.status === "disputed")
        .length,
    );
  }

  useEffect(() => {
    if (!chrome.ready) return;
    void api
      .me()
      .then((me) => setActorUserId(me.actor.userId))
      .catch(() => setActorUserId(null));
  }, [chrome.ready]);

  useEffect(() => {
    if (!chrome.ready) return;
    if (!chrome.workspaceId) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setBalances(null);
      setOutings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh(chrome.workspaceId)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [chrome.workspaceId, chrome.ready]);

  useLiveInvalidation(["expenses", "balances", "settlements"], () => {
    if (!chrome.ready || !chrome.workspaceId) return;
    void refresh(chrome.workspaceId).catch(() => {
      /* keep last good data */
    });
  });

  function onGroupCreated(created: WorkspaceSummary) {
    setWorkspace(created);
    setError(null);
    flashSuccess(`گروه «${created.name}» ساخته شد`);
    void refresh(created.id);
  }

  function onCreateOuting() {
    if (!chrome.workspaceId) return;
    const title = outingTitle.trim();
    if (!title) {
      setError("عنوان گردش را وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const budgetMinor =
            outingBudgetToman.trim() === ""
              ? undefined
              : String(Math.round(Number(outingBudgetToman.replaceAll(",", "")) * 10));
          if (outingBudgetToman.trim() && (!budgetMinor || !/^\d+$/.test(budgetMinor))) {
            setError("سقف بودجه تومان نامعتبر است");
            return;
          }
          const created = await api.createOuting(chrome.workspaceId, {
            title,
            occurredOn: todayIsoLocal(),
            startsOn: todayIsoLocal(),
            endsOn: outingEndsOn.trim() || undefined,
            budgetCapMinor: budgetMinor,
            idempotencyKey: newClientId(),
          });
          setOutingTitle("");
          setOutingBudgetToman("");
          setOutingEndsOn("");
          flashSuccess(`گردش «${created.title}» ساخته شد`);
          await refresh(chrome.workspaceId);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت گردش ناموفق"));
        }
      })();
    });
  }

  function memberLabel(userId: string) {
    return members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);
  }

  const pageError = error ?? chrome.error;
  const postedCount = expenses.filter((e) => e.status === "posted").length;
  const financeManagerCount = members.filter(
    (m) => !m.disabledAt && isFinanceManagerRole(m.role),
  ).length;
  const setupComplete =
    !loading &&
    Boolean(slug) &&
    financeManagerCount >= 1 &&
    members.length >= 2 &&
    postedCount > 0;

  const myNetMinor =
    balances && actorUserId
      ? (balances.lines.find((l) => l.userId === actorUserId)?.net.amountMinor ?? "0")
      : "0";
  const myNet = netFromIrrMinor(myNetMinor, displayUnit);

  const actionItems = useMemo((): SpaceHomeActionItem[] => {
    if (!balances || !actorUserId || !slug) return [];
    const peers = sortPeersByAbsNet(
      balances.lines
        .filter((l) => l.userId !== actorUserId)
        .map((l) => ({
          userId: l.userId,
          name: memberLabel(l.userId),
          amountMinor: l.net.amountMinor,
        })),
      displayUnit,
    ).slice(0, 5);
    return peers.map((peer) => {
      const settleDisplay = irrMinorToDisplayInteger(
        Math.abs(peer.net.irrMinor),
        displayUnit,
      ).toString();
      const href = `${settlementsHref}${settlementsHref.includes("?") ? "&" : "?"}settleTo=${encodeURIComponent(peer.userId)}&settleAmount=${settleDisplay}#settlement-panel`;
      return {
        id: peer.userId,
        title: peer.name,
        detail:
          peer.net.tone === "debt"
            ? `${formatMoneyFromIrrMinor(Math.abs(peer.net.irrMinor), displayUnit)} ${unitLabel} بدهی`
            : `${formatMoneyFromIrrMinor(peer.net.irrMinor, displayUnit)} ${unitLabel} طلب`,
        href,
        actionLabel: "تسویه",
      };
    });
  }, [balances, actorUserId, slug, displayUnit, unitLabel, settlementsHref, members]);

  const activityItems = useMemo((): SpaceHomeActivityItem[] => {
    return expenses.slice(0, 5).map((e) => ({
      id: e.id,
      title: e.title,
      detail: `${expenseStatusLabel(e.status)} · ${formatMoneyFromIrrMinor(e.total.amountMinor, displayUnit)} ${unitLabel}`,
      href: `${expensesHref}?expense=${encodeURIComponent(e.id)}#expense-inspector`,
    }));
  }, [expenses, expensesHref, displayUnit, unitLabel]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame title="" state="ready">
        <FlashMessages error={pageError} successMessage={successMessage} />

        {loading ? (
          <LoadingState label="در حال بارگذاری خلاصهٔ گروه…" rows={4} />
        ) : pageError && !workspace ? (
          <ErrorState title={pageError} />
        ) : !workspace ? (
          <SectionCard title="ساخت گروه" delayClass="delay1">
            <CreateGroupForm onCreated={onGroupCreated} />
            <EmptyHint>هنوز گروهی فعال نیست — یکی بسازید یا از خانه فضای دیگری باز کنید.</EmptyHint>
          </SectionCard>
        ) : (
          <SpaceHomeLayout
            title={workspace.name}
            roleBadge={myRole ? membershipRoleLabel(myRole) : null}
            primaryAction={
              setupComplete && slug && canAdd ? (
                <Link
                  className="dang-btn dang-btn--primary dang-btn--md"
                  href={canonicalHref("record", slug)}
                >
                  ثبت خرج
                </Link>
              ) : !slug ? (
                <Link href={canonicalHref("home")}>{NAV_LABELS.home}</Link>
              ) : undefined
            }
            secondaryAction={
              myNet.tone !== "settled" || openSettlementCount > 0 ? (
                <Link
                  href={settlementsHref}
                  className="dang-btn dang-btn--md dang-btn--ghost"
                >
                  تسویه
                </Link>
              ) : null
            }
            keyNumber={
              <SpaceHomeKeyNumber
                label={spaceHomeKeyLabel("group", myNet.tone)}
                amount={
                  myNet.tone === "settled"
                    ? openSettlementCount > 0
                      ? `${openSettlementCount.toLocaleString("fa-IR")} تسویه در جریان`
                      : "تسویه"
                    : `${myNet.tone === "credit" ? "+" : "−"}${formatMoneyFromIrrMinor(Math.abs(myNet.irrMinor), displayUnit)} ${unitLabel}`
                }
                tone={myNet.tone}
                meta={
                  <>
                    <span>{workspaceTemplateLabel(workspace.template)}</span>
                    <span>{members.length.toLocaleString("fa-IR")} عضو</span>
                  </>
                }
              />
            }
            actions={<SpaceHomeActions items={actionItems} />}
            activity={<SpaceHomeActivity items={activityItems} />}
            extras={
              <>
                {slug && homeSpec?.panels.setupChecklist !== false ? (
                  <GroupSetupChecklist
                    slug={slug}
                    memberCount={members.length}
                    financeManagerCount={financeManagerCount}
                    postedCount={postedCount}
                    canManageMembers={
                      isMembershipManagerRole(myRole) && !readOnlySpace
                    }
                    canAddExpense={canAdd}
                  />
                ) : null}
                {slug ? (
                  <details className={spaceHomeStyles.collapsedExtra}>
                    <summary>شناسهٔ عمومی فضا</summary>
                    <GroupPublicIdCard slug={slug} name={workspace.name} />
                  </details>
                ) : null}
                {slug &&
                chrome.workspaceId &&
                homeSpec?.panels.outingComposer !== false ? (
                  <details className={spaceHomeStyles.collapsedExtra}>
                    <summary>
                      گردش چندخرجی
                      {outings.length > 0
                        ? ` (${outings.length.toLocaleString("fa-IR")})`
                        : ""}
                    </summary>
                    <div>
                      {readOnlySpace || homeSpec?.canAddExpense === false ? (
                        <EmptyHint>
                          نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ساخت گردش فعال
                          نیست.
                        </EmptyHint>
                      ) : (
                        <FormStack density="compact">
                          <TextField
                            label="عنوان گردش"
                            value={outingTitle}
                            onChange={(e) => setOutingTitle(e.target.value)}
                            hint="مثلاً بیرون‌رفتن جمعه = بستنی + ناهار"
                          />
                          <TextField
                            label="سقف بودجه (تومان، اختیاری)"
                            value={outingBudgetToman}
                            onChange={(e) => setOutingBudgetToman(e.target.value)}
                          />
                          <TextField
                            label="پایان بازه (YYYY-MM-DD، اختیاری)"
                            value={outingEndsOn}
                            onChange={(e) => setOutingEndsOn(e.target.value)}
                          />
                          <Button type="button" onClick={onCreateOuting} disabled={pending}>
                            ساخت گردش
                          </Button>
                          {outings.length > 0 ? (
                            <ul>
                              {outings.map((row) => (
                                <li key={row.id}>
                                  <Link
                                    href={`${expensesHref}?outing=${encodeURIComponent(row.id)}#quick-expense`}
                                  >
                                    {row.title} ({row.expenseIds.length})
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </FormStack>
                      )}
                    </div>
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
