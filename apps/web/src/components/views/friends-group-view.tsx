"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
  roleNavProfile,
} from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { hubPathFor } from "@/lib/hub-links";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { statementsListHref } from "@/lib/statement-links";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { membershipRoleLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { GroupBalanceHero } from "@/components/shell/group-balance-hero";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { GroupSetupChecklist } from "@/components/shell/group-setup-checklist";
import { SpaceFrequentActions } from "@/components/shell/space-frequent-actions";

/**
 * Kind space home for friends/household groups (`/w/…/space`).
 * Summary + frequent actions — full modules live on sidebar routes.
 */
export function FriendsGroupView() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [openSettlementCount, setOpenSettlementCount] = useState(0);
  const [groupName, setGroupName] = useState("");
  const [groupTemplate, setGroupTemplate] = useState<"friends_family" | "household">(
    "friends_family",
  );
  const [ownerDefaultShares, setOwnerDefaultShares] = useState("1");
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
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;
  const statementsLive =
    chrome.capabilities?.providers?.statements === "csv_json_print_v1";
  const statementsHref = slug ? statementsListHref(slug) : hubPathFor("/workspaces");
  const membersHref = slug ? wPath(slug, "members") : hubPathFor("/workspaces/invite");
  const overviewHref = slug ? wPath(slug) : "/home";
  const myRole = members.find((m) => m.userId === actorUserId)?.role;
  const readOnlySpace = isReadOnlyRole(myRole);
  const persona = roleNavProfile(myRole);
  const addonsLive = Boolean(chrome.capabilities?.productFlags?.addonAck);
  const allowanceLive = Boolean(chrome.capabilities?.productFlags?.allowance);
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

  function onCreateGroup() {
    const name = groupName.trim();
    if (!name) {
      setError("نام گروه را وارد کنید");
      return;
    }
    const ascii = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 28);
    const slugPrefix = groupTemplate === "household" ? "family" : "friends";
    const nextSlug = `${slugPrefix}-${ascii || Date.now().toString(36)}`.slice(0, 48);
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createWorkspace(
            {
              name,
              slug: nextSlug,
              template: groupTemplate,
              ownerDefaultShares: Math.max(
                1,
                Math.min(100, Number(ownerDefaultShares) || 1),
              ),
            },
            newClientId(),
          );
          chrome.selectWorkspace(created.id);
          chrome.refreshChrome();
          setWorkspace(created);
          setGroupName("");
          setError(null);
          flashSuccess(
            groupTemplate === "household"
              ? `گروه خانواده «${created.name}» ساخته شد`
              : `گروه «${created.name}» ساخته شد`,
          );
          await refresh(created.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت گروه ناموفق"));
        }
      })();
    });
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

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title="خلاصهٔ گروه"
        kicker={
          workspace
            ? `${workspaceTemplateLabel(workspace.template)} · ${members.length.toLocaleString("fa-IR")} عضو`
            : undefined
        }
        description={
          persona?.homeHintFa ??
          "وضعیت پول و اقدام‌های پرتکرار این گروه — ماژول‌های کامل از نوار کناری یا مرکز فضای کاری."
        }        primaryAction={
          slug && !readOnlySpace ? (
            <Link href={`${expensesHref}#quick-expense`}>{NAV_LABELS.addExpense}</Link>
          ) : slug ? (
            <Link href={overviewHref}>مرکز فضای کاری</Link>
          ) : (
            <Link href="/home">{NAV_LABELS.home}</Link>
          )
        }
        secondaryActions={
          slug ? (
            <>
              <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
              <Link href={overviewHref}>مرکز فضای کاری</Link>
            </>
          ) : undefined
        }
        state="ready"
      >
        <FlashMessages error={pageError} successMessage={successMessage} />

        {loading ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری خلاصهٔ گروه…" />
        ) : (
          <ProductGrid>
            {slug ? (
              <StatusLine>
                <Link href={overviewHref}>مرکز فضای کاری</Link>
                {" · "}
                خلاصهٔ همین گروه — فهرست کامل ابزارها در نوار کناری
              </StatusLine>
            ) : null}

            {workspace && balances && actorUserId ? (
              <GroupBalanceHero
                workspaceName={workspace.name}
                myNetMinor={
                  balances.lines.find((l) => l.userId === actorUserId)?.net.amountMinor ??
                  "0"
                }
                peers={balances.lines
                  .filter((l) => l.userId !== actorUserId)
                  .map((l) => ({
                    userId: l.userId,
                    name: memberLabel(l.userId),
                    amountMinor: l.net.amountMinor,
                  }))}
                settleHref={settlementsHref}
                expenseHref={`${expensesHref}#quick-expense`}
                simplifyHref={settlementsHref}
                simplifyAvailable={Boolean(
                  chrome.capabilities?.productFlags?.debtSimplifyApi,
                )}
                openSettlements={openSettlementCount}
                recentExpenses={expenses.slice(0, 5).map((e) => ({
                  id: e.id,
                  title: e.title,
                  toman: Math.round(Number(e.total.amountMinor) / 10),
                  status: e.status,
                }))}
              />
            ) : null}

            {slug ? (
              <>
                <GroupPublicIdCard slug={slug} name={workspace?.name} />
                <GroupSetupChecklist
                  slug={slug}
                  memberCount={members.length}
                  financeManagerCount={members.filter(
                    (m) => !m.disabledAt && isFinanceManagerRole(m.role),
                  ).length}
                  postedCount={postedCount}
                  canManageMembers={
                    isMembershipManagerRole(myRole) && !readOnlySpace
                  }
                />
                <SpaceFrequentActions
                  slug={slug}
                  openSettlements={openSettlementCount}
                  memberCount={members.length}
                  canAddExpense={!readOnlySpace}
                  inviteHref={`${membersHref}#invite-create-panel`}
                />
              </>
            ) : null}

            {!workspace ? (
              <SectionCard title="ساخت گروه" delayClass="delay1">
                <FormStack>
                  <TextField
                    label="نام گروه"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    hint="مثلاً سفر شمال، خانه، تیم فوتبال"
                  />
                  <SelectField
                    label="نوع گروه"
                    value={groupTemplate}
                    onChange={(e) =>
                      setGroupTemplate(e.target.value as "friends_family" | "household")
                    }
                  >
                    <option value="friends_family">دوستان</option>
                    <option value="household">خانواده</option>
                  </SelectField>
                  <TextField
                    label="سهم پیش‌فرض شما"
                    value={ownerDefaultShares}
                    onChange={(e) => setOwnerDefaultShares(e.target.value)}
                    hint="مثلاً ۲ برای والدین در خانواده — بعداً برای اعضا قابل ویرایش است"
                  />
                  <Button type="button" onClick={onCreateGroup} disabled={pending}>
                    ساخت گروه
                  </Button>
                </FormStack>
                <EmptyHint>هنوز گروهی فعال نیست — یکی بسازید یا از خانه فضای دیگری باز کنید.</EmptyHint>
              </SectionCard>
            ) : null}

            {slug ? (
              <SectionCard title="مسیرهای مرتبط" tone="quiet" delayClass="delay1">
                <StatusLine>
                  <Link href={wPath(slug, "expenses")}>{NAV_LABELS.expenses}</Link>
                  {" · "}
                  <Link href={wPath(slug, "settlements")}>{NAV_LABELS.settlements}</Link>
                  {" · "}
                  <Link href={wPath(slug, "ledger")}>{NAV_LABELS.ledger}</Link>
                  {" · "}
                  <Link href={membersHref}>{NAV_LABELS.members}</Link>
                  {statementsLive ? (
                    <>
                      {" · "}
                      <Link href={statementsHref}>{NAV_LABELS.statements}</Link>
                    </>
                  ) : null}
                  {" · "}
                  <Link href={wPath(slug, "invoices")}>{NAV_LABELS.invoices}</Link>
                  {addonsLive ? (
                    <>
                      {" · "}
                      <Link href={wPath(slug, "addons")}>{NAV_LABELS.addons}</Link>
                    </>
                  ) : null}
                  {allowanceLive ? (
                    <>
                      {" · "}
                      <Link href={`${membersHref}#member-allowances`}>سقف هزینه</Link>
                    </>
                  ) : null}
                  {" · "}
                  <Link href="/spaces/new?kind=group">ساخت گروه دیگر</Link>
                </StatusLine>
              </SectionCard>
            ) : null}

            {slug && chrome.workspaceId ? (
              <details className="reportDetails">
                <summary>
                  <span>گردش چندخرجی (اختیاری)</span>
                  <span>{outings.length}</span>
                </summary>
                <div className="reportDetails__body">
                  {readOnlySpace ? (
                    <EmptyHint>
                      نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ساخت گردش فعال نیست.
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
                        <StatusLine>
                          {outings.map((row, i) => (
                            <span key={row.id}>
                              {i > 0 ? " · " : null}
                              <Link
                                href={`${expensesHref}?outing=${encodeURIComponent(row.id)}#quick-expense`}
                              >
                                {row.title} ({row.expenseIds.length})
                              </Link>
                            </span>
                          ))}
                        </StatusLine>
                      ) : null}
                    </FormStack>
                  )}
                </div>
              </details>
            ) : null}
          </ProductGrid>
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
