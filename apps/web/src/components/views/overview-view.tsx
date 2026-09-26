"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ActivityItem } from "@dang/contracts";
import { spaceKindForTemplate, isFinanceManagerRole, type PettyCashFundSummary } from "@dang/contracts";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { formatMoney, formatMoneyFromIrrMinor, irrMinorToDisplayInteger, type DisplayUnit } from "@dang/ui";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyUnitSuffix } from "@/lib/money-labels";
import { AppShell } from "@/components/app-shell";
import type { ContextualMosaicFact } from "@/components/shell/contextual-mosaic-hub";
import { HomeRootLauncher } from "@/components/shell/home-root-launcher";
import { HomeBriefingPanel } from "@/components/shell/home-briefing-panel";
import { TreasuryBalanceCard } from "@/components/shell/treasury-balance-card";
import { HomeMoneyCommand, rangeForPreset } from "@/components/shell/home-money-command";
import type { WorkspaceMoneyPulse } from "@dang/contracts";
import { GroupOpsRail } from "@/components/shell/group-ops-rail";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { GroupSetupChecklist } from "@/components/shell/group-setup-checklist";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { ProviderStubBadges } from "@/components/shell/provider-stub-badges";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { wPath } from "@/lib/workspace-paths";
import {
  contextualMosaicSections,
  homeDomainHref,
  parseDomainGroup,
} from "@/lib/navigation-v2";
import {
  filterMosaicByUsageTier,
  navUsageTierFromCounts,
} from "@/lib/nav-usage-tier";
import {
  filterLivePinned,
  listPinnedDestinations,
  togglePinnedDestination,
  type PinnedDestination,
} from "@/lib/pinned-destinations";
import { spaceNavFlagsFromCapabilities } from "@/lib/workspace-page-access";
import {
  expenseStatusLabel,
  needStatusLabel,
} from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalTheme } from "@/lib/theme";
import { formatFaDate } from "@/lib/fa-datetime";
import { FlashMessages } from "@/lib/use-flash-message";
import { MotionSceneStrip } from "@/components/visual/motion-scene";
import { FirstRunTour } from "@/components/views/first-run-tour";
import { DemoConfirmDialog } from "@/components/views/demo-confirm-dialog";

function useAnimatedBalance(
  targetIrrMinor: number,
  motionEnabled: boolean,
  ready: boolean,
  unit: DisplayUnit,
) {
  const target = Number(irrMinorToDisplayInteger(Math.abs(targetIrrMinor), unit));
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(target);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !ready) return;
    if (!motionEnabled) {
      setValue(target);
      return;
    }

    setValue(0);
    const startedAt = performance.now();
    const duration = 1100;
    let frameId = 0;

    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [mounted, motionEnabled, ready, target]);

  if (!ready) return "—";
  return formatMoney(value, unit);
}

type DashboardState = {
  workspaceId: string;
  workspaceName: string;
  userName: string;
  balanceToman: number;
  /** Signed IRR minor for the actor net (canonical). */
  balanceIrrMinor: number;
  postedCount: number;
  postedSpendToman: number;
  openSettlementCount: number;
  pendingApprovalCount: number;
  approvalSlaBreached: number;
  needCount: number;
  notificationCount: number;
  persistence: string;
  recentExpenses: Array<{ id: string; title: string; toman: number; status: string }>;
  recentNeeds: Array<{ id: string; title: string; status: string }>;
  memberNames: string[];
  /** Active membership role of the current actor (for ops rail). */
  myRole: string;
  /** Active finance managers (owner/admin/finance) — for setup checklist. */
  financeManagerCount: number;
  previewExpenseTitle: string;
  previewExpenseToman: string;
  rangeLabel: string;
  rangeFrom: string;
  rangeTo: string;
  moneyPulse: WorkspaceMoneyPulse;
  pettyCashFunds: PettyCashFundSummary[];
  savingsBalanceMinor: string | null;
  savingsGoalCount: number;
};

export function OverviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderQuery = searchParams.get("folder");
  const homeFolder = parseDomainGroup(folderQuery);
  const homeGroup = searchParams.get("group");
  const chrome = useAppChrome();
  const displayUnit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(displayUnit);
  const theme = useOptionalTheme();
  const motionEnabled = theme ? theme.allowsAmbient || theme.allowsFeedback : true;
  const [data, setData] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowDemoSeed, setAllowDemoSeed] = useState(false);
  const [demoConfirm, setDemoConfirm] = useState<
    "seed" | "colleagues" | "purge" | "purge-aftab" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [dashRange, setDashRange] = useState(() => rangeForPreset("month"));
  const [feedItems, setFeedItems] = useState<ActivityItem[]>([]);
  const balance = useAnimatedBalance(
    data?.balanceIrrMinor ?? 0,
    motionEnabled,
    Boolean(data),
    displayUnit,
  );
  const activityLive = chrome.capabilities?.providers?.activityFeed === "activity_v1";
  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = activeWs?.slug ?? null;
  const expensesHref = slug ? `${wPath(slug, "expenses")}#quick-expense` : hubPathFor("/workspaces");
  const financeHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const spaceHref = slug ? wPath(slug, "space") : hubPathFor("/group");
  const procurementHref = slug ? wPath(slug, "procurement") : hubPathFor("/workspaces/procurement");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;

  function load(workspaceId: string, from = dashRange.from, to = dashRange.to) {
    startTransition(() => {
      void (async () => {
        try {
          const identity = getDevIdentity();
          setDevIdentity(identity.subject, identity.displayName);
          // AppChrome already loaded workspaces/capabilities — only fetch page data.
          const workspace =
            chrome.workspaces.find((item) => item.id === workspaceId) ??
            chrome.workspaces[0];
          if (!workspace) {
            setError("فضای کاری ندارید — یک فضا بسازید یا از دعوت استفاده کنید.");
            setData(null);
            return;
          }
          const [dashboard, needs, members, approvalCount, activityPage, pettyFunds, savingsFund] =
            await Promise.all([
            api.workspaceDashboard(workspace.id, from, to),
            api.listNeeds(workspace.id).catch(() => []),
            api.listMembers(workspace.id).catch(() => []),
            chrome.capabilities?.productFlags?.approvalQueue
              ? api.approvalQueueCount(workspace.id).catch(() => ({ count: 0 }))
              : Promise.resolve({ count: 0 }),
            chrome.capabilities?.providers?.activityFeed === "activity_v1"
              ? api.listActivity(workspace.id, { limit: 12 }).catch(() => ({ items: [] }))
              : Promise.resolve({ items: [] as ActivityItem[] }),
            chrome.capabilities?.providers?.pettyCash === "fund_v1"
              ? api.listPettyCash(workspace.id).catch(() => [] as PettyCashFundSummary[])
              : Promise.resolve([] as PettyCashFundSummary[]),
            spaceKindForTemplate(workspace.template) === "personal" &&
            chrome.capabilities?.providers?.savingsGoals === "goals_v1"
              ? api.getSavingsFund().catch(() => null)
              : Promise.resolve(null),
          ]);
          let approvalSlaBreached = 0;
          if (
            approvalCount.count > 0 &&
            chrome.capabilities?.productFlags?.approvalQueue
          ) {
            const queue = await api
              .listApprovalQueue(workspace.id)
              .catch(() => []);
            approvalSlaBreached = queue.filter((item) => item.slaBreached).length;
          }
          setFeedItems(activityPage.items);
          setAllowDemoSeed(Boolean(chrome.demoSeedAllowed));
          const netMinor = Number(dashboard.actorNet.amountMinor);
          const firstExpense = dashboard.activity.recentExpenses[0];
          setData({
            workspaceId: dashboard.workspaceId,
            workspaceName: dashboard.workspaceName,
            userName: chrome.userName || identity.displayName,
            balanceToman: Math.round(netMinor / 10),
            balanceIrrMinor: Number.isFinite(netMinor) ? Math.trunc(netMinor) : 0,
            postedCount: dashboard.spend.postedCount,
            postedSpendToman: Math.round(
              Number(dashboard.spend.postedTotal.amountMinor) / 10,
            ),
            openSettlementCount: dashboard.settlements.openCount,
            pendingApprovalCount: approvalCount.count,
            approvalSlaBreached,
            needCount: needs.length,
            notificationCount: dashboard.activity.unreadNotifications,
            persistence: chrome.persistenceLabel,
            recentExpenses: dashboard.activity.recentExpenses.slice(0, 5).map((e) => ({
              id: e.id,
              title: e.title,
              toman: Math.round(Number(e.total.amountMinor) / 10),
              status: expenseStatusLabel(e.status),
            })),
            recentNeeds: needs.slice(0, 3).map((n) => ({
              id: n.id,
              title: n.title,
              status: needStatusLabel(n.status),
            })),
            memberNames: members.map((m) => m.displayName).filter(Boolean),
            myRole:
              members.find((m) => m.userId === chrome.actor?.userId)?.role ?? "",
            financeManagerCount: members.filter(
              (m) => !m.disabledAt && isFinanceManagerRole(m.role),
            ).length,
            previewExpenseTitle: firstExpense?.title ?? "—",
            previewExpenseToman: firstExpense
              ? formatMoneyFromIrrMinor(firstExpense.total.amountMinor, displayUnit)
              : "—",
            rangeLabel: `${formatFaDate(dashboard.from)} تا ${formatFaDate(dashboard.to)}`,
            rangeFrom: dashboard.from,
            rangeTo: dashboard.to,
            moneyPulse: dashboard.moneyPulse,
            pettyCashFunds: pettyFunds.filter((f) => f.active),
            savingsBalanceMinor: savingsFund?.balanceMinor ?? null,
            savingsGoalCount: savingsFund?.goalCount ?? 0,
          });
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }

  useEffect(() => {
    if (!chrome.ready || !chrome.workspaceId) return;
    load(chrome.workspaceId);
  }, [chrome.ready, chrome.workspaceId]);

  useEffect(() => {
    if (!slug) return;
    if (folderQuery && !homeFolder) {
      router.replace(homeDomainHref(slug));
    }
  }, [slug, folderQuery, homeFolder, router]);

  // The home figures (net balance, spend, open settlements) are the first thing
  // a member checks, so they follow the ledger rather than the last page load.
  useLiveInvalidation(["expenses", "balances", "settlements", "invoices:"], () => {
    if (!chrome.ready || !chrome.workspaceId) return;
    load(chrome.workspaceId);
  });

  const spaceKind = spaceKindForTemplate(activeWs?.template);
  const { role: membershipRole } = useWorkspaceMembershipRole(chrome.workspaceId);
  const domainSections = (() => {
    const flags = spaceNavFlagsFromCapabilities(chrome.capabilities);
    const base = contextualMosaicSections(
      activeWs?.template,
      slug,
      flags,
      "home",
      membershipRole || null,
    );
    const tier = navUsageTierFromCounts({
      postedExpenseCount: data?.postedCount ?? 0,
      memberCount: data?.memberNames.length,
    });
    return filterMosaicByUsageTier(base, tier);
  })();
  const [pins, setPins] = useState<PinnedDestination[]>([]);
  useEffect(() => {
    const hrefs = new Set(
      domainSections.flatMap((section) => section.items.map((item) => item.href)),
    );
    const next = filterLivePinned(listPinnedDestinations(), hrefs);
    setPins((prev) => {
      if (
        prev.length === next.length &&
        prev.every((row, index) => row.href === next[index]?.href)
      ) {
        return prev;
      }
      return next;
    });
  }, [activeWs?.template, slug, chrome.capabilities, chrome.platformRole]);
  const pinnedHrefSet = new Set(pins.map((pin) => pin.href));
  const missionFacts: Partial<Record<string, ContextualMosaicFact>> = data
    ? {
        approvals: {
          value: String(data.pendingApprovalCount),
          label: "در صف تأیید",
          tone: data.pendingApprovalCount > 0 ? "attention" : "neutral",
        },
        expenses: {
          value: String(data.postedCount),
          label: "خرج ثبت‌شده در بازه",
          tone: "neutral",
        },
        settlements: {
          value: String(data.openSettlementCount),
          label: "تسویه باز",
          tone: data.openSettlementCount > 0 ? "attention" : "positive",
        },
        procurement: {
          value: String(data.needCount),
          label: "نیاز خرید",
          tone: data.needCount > 0 ? "attention" : "neutral",
        },
      }
    : {};

  return (
    <AppShell
      workspaceId={data?.workspaceId}
      workspaceName={data?.workspaceName}
      userName={data?.userName}
      persistenceLabel={chrome.persistenceLabel}
      motionOff={theme ? theme.motionEffective === "off" : false}
      notificationUnreadCount={data?.notificationCount ?? 0}
    >
      <FlashMessages error={error} />
      <ProviderStubBadges capabilities={chrome.capabilities} />
      <FirstRunTour workspaceSlug={slug} />
      {demoConfirm ? (
        <DemoConfirmDialog
          title={
            demoConfirm === "seed"
              ? "کاشت دادهٔ نمونهٔ فضا (دمو)"
              : demoConfirm === "colleagues"
                ? "کاشت سناریوی همکاران (دمو)"
                : demoConfirm === "purge-aftab"
                  ? "پاک‌سازی پروژهٔ آفتاب (دمو)"
                  : "پاک‌سازی داده‌های دموی همکاران"
          }
          confirmExact={
            demoConfirm === "seed"
              ? "SEED_WORKSPACE_DEMO"
              : demoConfirm === "colleagues"
                ? "SEED_COLLEAGUES_DEMO"
                : demoConfirm === "purge-aftab"
                  ? "PURGE_AFTAB_DEMO"
                  : "PURGE_COLLEAGUES_DEMO"
          }
          pending={pending}
          onCancel={() => setDemoConfirm(null)}
          onConfirm={() => {
            const action = demoConfirm;
            startTransition(() => {
              void (async () => {
                try {
                  if (action === "seed") {
                    await api.seedDemo();
                    if (chrome.workspaceId) load(chrome.workspaceId);
                  } else if (action === "colleagues") {
                    await api.seedColleaguesDemo();
                    chrome.refreshChrome();
                    if (chrome.workspaceId) load(chrome.workspaceId);
                  } else if (action === "purge-aftab") {
                    await api.purgeAftabDemo();
                    chrome.refreshChrome();
                  } else {
                    await api.purgeColleaguesDemo();
                    chrome.refreshChrome();
                    if (chrome.workspaceId) load(chrome.workspaceId);
                  }
                  setError(null);
                  setDemoConfirm(null);
                } catch (err: unknown) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : action === "seed"
                        ? "خطای seed"
                        : action === "colleagues"
                          ? "خطای seed همکاران (دمو)"
                          : "خطای پاک‌سازی دمو",
                  );
                }
              })();
            });
          }}
        />
      ) : null}

      <div className="mosaicWorkspace">
        {!chrome.ready || (!data && pending) ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری خانه…" />
        ) : error && !data ? (
          <StatusLine>
            {error}{" "}
            <button
              type="button"
              className="textButton"
              disabled={pending}
              onClick={() => {
                if (chrome.workspaceId) load(chrome.workspaceId);
              }}
            >
              تلاش دوباره
            </button>
          </StatusLine>
        ) : !slug ? (
          <EmptyHint>فضای کاری را انتخاب کنید یا از فهرست فضاها یکی بسازید.</EmptyHint>
        ) : (
          <>
            {data &&
            navUsageTierFromCounts({
              postedExpenseCount: data.postedCount,
              memberCount: data.memberNames.length,
            }) === "starter" ? (
              <StatusLine>
                نمای ساده برای فضای تازه‌کار — مسیرهای پیشرفته با رشد استفاده (خرج‌های
                ثبت‌شده) باز می‌شوند. ابزارها همچنان همهٔ مسیرهای مجاز را نشان می‌دهد.
              </StatusLine>
            ) : null}
            {!homeFolder ? (
              <MotionSceneStrip kind="home" prominence="compact" />
            ) : null}

            {!homeFolder ? (
              <div className="mosaicWorkspace__primary">
                <div className="mosaicWorkspace__cue">
                  <HomeBriefingPanel
                    amountLabel={balance}
                    balanceToman={data?.balanceToman ?? 0}
                    openSettlements={data?.openSettlementCount ?? 0}
                    postedCount={data?.postedCount}
                    pendingApprovals={data?.pendingApprovalCount ?? 0}
                    approvalSlaBreached={data?.approvalSlaBreached ?? 0}
                    openNeeds={data?.needCount ?? 0}
                    unreadNotifications={data?.notificationCount ?? 0}
                    settleHref={settlementsHref}
                    expenseHref={expensesHref}
                    spaceHref={spaceHref}
                    approvalsHref={slug ? wPath(slug, "approvals") : settlementsHref}
                    needsHref={
                      spaceKind === "org" ? procurementHref : expensesHref
                    }
                    notificationsHref={
                      slug ? `${wPath(slug, "home")}#home-briefing` : "#home-briefing"
                    }
                    spaceKind={spaceKind}
                    persistenceHint={data?.persistence}
                    alerts={feedItems}
                  />
                  {slug &&
                  (spaceKind === "personal" ||
                    chrome.capabilities?.providers?.pettyCash === "fund_v1") ? (
                    <div className="mosaicWorkspace__treasury">
                      <TreasuryBalanceCard
                        spaceKind={spaceKind}
                        funds={data?.pettyCashFunds ?? []}
                        paymentsHref={wPath(slug, "payments")}
                        savingsHref="/me/finance#goals"
                        canManage={isFinanceManagerRole(data?.myRole)}
                        pending={pending}
                        density="compact"
                        savingsBalanceMinor={
                          spaceKind === "personal"
                            ? data?.savingsBalanceMinor
                            : null
                        }
                        savingsGoalCount={data?.savingsGoalCount}
                        onEnsureDefault={
                          data?.workspaceId &&
                          isFinanceManagerRole(data.myRole) &&
                          spaceKind !== "personal"
                            ? () => {
                                startTransition(() => {
                                  void (async () => {
                                    try {
                                      const result =
                                        await api.ensureDefaultPettyCashFund(
                                          data.workspaceId,
                                          {
                                            idempotencyKey: crypto.randomUUID(),
                                          },
                                        );
                                      setData((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              pettyCashFunds: result.funds.filter(
                                                (f) => f.active,
                                              ),
                                            }
                                          : prev,
                                      );
                                    } catch (err) {
                                      setError(
                                        friendlyErrorMessage(
                                          err,
                                          "ایجاد تنخواه ناموفق",
                                        ),
                                      );
                                    }
                                  })();
                                });
                              }
                            : undefined
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div
              className={
                homeFolder
                  ? "mosaicWorkspace__drill"
                  : "mosaicWorkspace__secondary"
              }
            >
              <HomeRootLauncher
                slug={slug}
                template={activeWs?.template}
                workspaceCount={chrome.workspaces.length}
                sections={domainSections}
                folderParam={homeFolder}
                groupParam={homeGroup}
                facts={missionFacts}
                reduceMotion={
                  !motionEnabled || Boolean(theme && !theme.allowsFeedback)
                }
                pinnedHrefs={pinnedHrefSet}
                urgency={
                  data
                    ? {
                        pendingApprovals: data.pendingApprovalCount,
                        openSettlements: data.openSettlementCount,
                        openNeeds: data.needCount,
                      }
                    : undefined
                }
                onTogglePin={(item) => {
                  togglePinnedDestination(item);
                  const hrefs = new Set(
                    domainSections.flatMap((s) => s.items.map((i) => i.href)),
                  );
                  setPins(filterLivePinned(listPinnedDestinations(), hrefs));
                }}
              />
            </div>

            {!homeFolder ? (
              <details className="mosaicWorkspace__more">
                <summary>جزئیات پول، میان‌برها و فعالیت</summary>
                <div className="mosaicWorkspace__moreBody">
                  {data?.moneyPulse && slug ? (
                    <HomeMoneyCommand
                      workspaceId={data.workspaceId}
                      slug={slug}
                      pulse={data.moneyPulse}
                      rangeLabel={data.rangeLabel}
                      from={data.rangeFrom}
                      to={data.rangeTo}
                      spaceKind={spaceKind}
                      pettyCashFunds={data.pettyCashFunds}
                      savingsBalanceMinor={data.savingsBalanceMinor}
                      savingsGoalCount={data.savingsGoalCount}
                      onRangeChange={(nextFrom, nextTo) => {
                        setDashRange({ from: nextFrom, to: nextTo });
                        if (chrome.workspaceId) {
                          load(chrome.workspaceId, nextFrom, nextTo);
                        }
                      }}
                    />
                  ) : null}
                  {slug ? (
                    <GroupOpsRail
                      slug={slug}
                      spaceKind={spaceKind}
                      memberCount={data?.memberNames.length}
                      openSettlements={data?.openSettlementCount ?? 0}
                      canManageMembers={
                        data?.myRole === "owner" ||
                        data?.myRole === "admin" ||
                        isFinanceManagerRole(data?.myRole)
                      }
                      showSubunits={spaceKind === "building" || spaceKind === "org"}
                      subunitsHint={
                        spaceKind === "building"
                          ? "واحدها و ساکنان هر واحد"
                          : "بخش‌ها و شرکت‌های زیرمجموعه"
                      }
                      treasuryBalanceMinor={
                        spaceKind === "personal"
                          ? data?.savingsBalanceMinor
                          : data?.pettyCashFunds?.[0]
                            ? data.pettyCashFunds
                                .filter((f) => f.active)
                                .reduce(
                                  (acc, f) => acc + BigInt(f.balanceMinor || "0"),
                                  0n,
                                )
                                .toString()
                            : data?.pettyCashFunds
                              ? "0"
                              : null
                      }
                      treasuryLabel={
                        spaceKind === "personal"
                          ? "پس‌انداز"
                          : spaceKind === "org"
                            ? "تنخواه سازمانی"
                            : spaceKind === "building"
                              ? "تنخواه ساختمان"
                              : "تنخواه گروه"
                      }
                    />
                  ) : null}
                  {slug &&
                  (spaceKind === "group" ||
                    spaceKind === "building" ||
                    spaceKind === "org") ? (
                    <>
                      <GroupPublicIdCard slug={slug} name={data?.workspaceName} />
                      {spaceKind === "group" || spaceKind === "building" ? (
                        <GroupSetupChecklist
                          slug={slug}
                          memberCount={data?.memberNames.length ?? 0}
                          financeManagerCount={data?.financeManagerCount ?? 0}
                          postedCount={data?.postedCount ?? 0}
                          canManageMembers={
                            data?.myRole === "owner" ||
                            data?.myRole === "admin" ||
                            isFinanceManagerRole(data?.myRole)
                          }
                        />
                      ) : null}
                    </>
                  ) : null}

                  <section className="homeActivity" aria-labelledby="home-activity-title">
                    <header className="homeActivity__head">
                      <h2 id="home-activity-title">فعالیت اخیر</h2>
                    </header>
                    {activityLive && feedItems.length > 0 ? (
                      <ul className="homeActivity__list">
                        {feedItems.map((item) => (
                          <li key={item.id}>
                            <div className="homeActivity__link">
                              <strong>{item.title}</strong>
                              <small>
                                {item.kind === "notification" ? "اعلان" : "ممیزی"}
                                {item.body ? ` · ${item.body}` : ""}
                                {" · "}
                                {formatFaDate(item.createdAt)}
                              </small>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {(data?.recentExpenses.length ?? 0) === 0 &&
                    (data?.recentNeeds.length ?? 0) === 0 &&
                    feedItems.length === 0 ? (
                      <p className="homeActivity__empty">
                        هنوز رویدادی نیست. با ثبت خرج اینجا پر می‌شود.
                      </p>
                    ) : (data?.recentExpenses.length ?? 0) > 0 ||
                      (data?.recentNeeds.length ?? 0) > 0 ? (
                      <ul className="homeActivity__list">
                        {data?.recentExpenses.map((item) => (
                          <li key={item.id}>
                            <Link
                              href={`${financeHref}?expense=${encodeURIComponent(item.id)}#expense-inspector`}
                              className="homeActivity__link"
                            >
                              <strong>{item.title}</strong>
                              <small>
                                {expenseStatusLabel(item.status)} ·{" "}
                                {formatMoneyFromIrrMinor(item.toman * 10, displayUnit)}{" "}
                                {unitLabel}
                              </small>
                            </Link>
                          </li>
                        ))}
                        {data?.recentNeeds.map((item) => (
                          <li key={`need-${item.id}`}>
                            <Link
                              href={
                                spaceKind === "org" ? procurementHref : expensesHref
                              }
                              className="homeActivity__link"
                            >
                              <strong>{item.title}</strong>
                              <small>نیاز خرید · {needStatusLabel(item.status)}</small>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>

                  {allowDemoSeed ? (
                    <details className="overviewTools">
                      <summary>ابزار توسعه (دمو)</summary>
                      <p className="overviewTools__row">
                        <button
                          type="button"
                          onClick={() =>
                            theme?.setMotion(
                              theme.motionEffective === "off" ? "full" : "off",
                            )
                          }
                        >
                          {theme?.motionEffective === "off"
                            ? "فعال‌کردن حرکت"
                            : "توقف حرکت"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDemoConfirm("purge-aftab")}
                        >
                          پاک‌سازی آفتاب (دمو)
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDemoConfirm("purge")}
                        >
                          پاک‌سازی همکاران (دمو)
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDemoConfirm("seed")}
                        >
                          کاشت نمونه (دمو)
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDemoConfirm("colleagues")}
                        >
                          سناریوی همکاران (دمو)
                        </button>
                      </p>
                    </details>
                  ) : null}
                </div>
              </details>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
