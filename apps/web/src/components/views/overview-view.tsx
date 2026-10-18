"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActivityItem } from "@dang/contracts";
import {
  spaceKindForTemplate,
  isFinanceManagerRole,
  isReadOnlyRole,
  moneyPulseFlowSeries,
  primaryCounterpartyEdge,
  type MembershipRole,
  type PettyCashFundSummary,
  type WorkspaceMoneyPulse,
} from "@dang/contracts";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import {
  ErrorState,
  formatMoney,
  formatMoneyFromIrrMinor,
  irrMinorToDisplayInteger,
  LoadingState,
  type DisplayUnit,
} from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import type { ContextualMosaicFact } from "@/components/shell/contextual-mosaic-hub";
import { HomeRootLauncher } from "@/components/shell/home-root-launcher";
import { TreasuryBalanceCard } from "@/components/shell/treasury-balance-card";
import { MoneyEntryChooser } from "@/components/shell/money-entry-chooser";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { StructuralSubunitsRail } from "@/components/shell/structural-subunits-rail";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { GroupSetupChecklist } from "@/components/shell/group-setup-checklist";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { ProviderStubBadges } from "@/components/shell/provider-stub-badges";
import {
  SpaceHomeActivity,
  SpaceHomeActions,
  SpaceHomeKeyNumber,
  SpaceHomeLayout,
  SpaceHomeMiniChart,
  spaceHomeKeyLabel,
  spaceHomePrimaryCta,
  type SpaceHomeActionItem,
  type SpaceHomeActivityItem,
} from "@/components/views/space-home";
import { PersonalHomeExtras } from "@/components/views/space-home/personal-home-extras";
import { GroupOutingHomePanel } from "@/components/views/space-home/group-outing-home-panel";
import { spaceHomeStyles } from "@/components/views/space-home/space-home-layout";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { canonicalHref } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
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
  membershipRoleLabel,
  needStatusLabel,
} from "@/lib/status-labels";
import { netFromIrrMinor, sortPeersByAbsNet } from "@/lib/space-net-balance";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalTheme } from "@/lib/theme";
import { formatFaDate } from "@/lib/fa-datetime";
import { FlashMessages } from "@/lib/use-flash-message";
import { FirstRunTour } from "@/components/views/first-run-tour";
import { DemoConfirmDialog } from "@/components/views/demo-confirm-dialog";
import { rangeForPreset } from "@/components/shell/home-money-command";

/** Space-home pages always show تومان. */
const HOME_UNIT: DisplayUnit = "toman";
const UNIT_LABEL = "تومان";

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

function membershipRoleOrNull(role: string | null | undefined): MembershipRole | null {
  switch (role) {
    case "owner":
    case "admin":
    case "finance":
    case "deputy_finance":
    case "approver":
    case "buyer":
    case "asset_custodian":
    case "member":
    case "auditor":
    case "guest":
      return role;
    default:
      return null;
  }
}

type PeerBalance = {
  userId: string;
  name: string;
  amountMinor: string;
};

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
  recentExpenses: Array<{ id: string; title: string; toman: number; status: string; irrMinor: string }>;
  recentNeeds: Array<{ id: string; title: string; status: string }>;
  memberNames: string[];
  myRole: MembershipRole | null;
  financeManagerCount: number;
  rangeLabel: string;
  rangeFrom: string;
  rangeTo: string;
  moneyPulse: WorkspaceMoneyPulse;
  pettyCashFunds: PettyCashFundSummary[];
  savingsBalanceMinor: string | null;
  savingsGoalCount: number;
  counterparty: {
    direction: "debt" | "credit";
    name: string;
    amountMinor: string;
  } | null;
  peerBalances: PeerBalance[];
};

export function OverviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderQuery = searchParams.get("folder");
  const homeFolder = parseDomainGroup(folderQuery);
  const homeGroup = searchParams.get("group");
  const chrome = useAppChrome();
  const theme = useOptionalTheme();
  const motionEnabled = theme ? theme.allowsAmbient || theme.allowsFeedback : true;
  const [loadedData, setData] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowDemoSeed, setAllowDemoSeed] = useState(false);
  const [demoConfirm, setDemoConfirm] = useState<
    "seed" | "colleagues" | "purge" | "purge-aftab" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const dashRange = useMemo(() => rangeForPreset("month"), []);
  const [feedItems, setFeedItems] = useState<ActivityItem[]>([]);
  const loadRequestRef = useRef(0);
  const workspaceIdRef = useRef(chrome.workspaceId);
  workspaceIdRef.current = chrome.workspaceId;
  const activityLive = chrome.capabilities?.providers?.activityFeed === "activity_v1";
  const chartsLive = chrome.capabilities?.providers?.charts === "charts_v1";
  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  /** Stale dashboard from a previous space must not render under the new space. */
  const data =
    loadedData !== null && loadedData.workspaceId === chrome.workspaceId
      ? loadedData
      : null;
  const balance = useAnimatedBalance(
    data?.balanceIrrMinor ?? 0,
    motionEnabled,
    Boolean(data),
    HOME_UNIT,
  );
  const slug = activeWs?.slug ?? null;
  const expensesHref = canonicalHref("expenses", slug);
  const recordHref = canonicalHref("record", slug);
  const financeHref = canonicalHref("expenses", slug);
  const procurementHref = canonicalHref("procurement", slug);
  const settlementsHref = canonicalHref("settlements", slug);
  const invoicesHref = canonicalHref("invoices", slug);

  function load(workspaceId: string, from = dashRange.from, to = dashRange.to) {
    const requestId = ++loadRequestRef.current;
    startTransition(() => {
      void (async () => {
        try {
          const identity = getDevIdentity();
          setDevIdentity(identity.subject, identity.displayName);
          const workspace =
            chrome.workspaces.find((item) => item.id === workspaceId) ??
            chrome.workspaces[0];
          if (!workspace) {
            if (
              requestId !== loadRequestRef.current ||
              workspaceId !== workspaceIdRef.current
            ) {
              return;
            }
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
          if (
            requestId !== loadRequestRef.current ||
            workspace.id !== workspaceIdRef.current
          ) {
            return;
          }
          setFeedItems(activityPage.items);
          setAllowDemoSeed(Boolean(chrome.demoSeedAllowed));
          const netMinor = Number(dashboard.actorNet.amountMinor);
          const kind = spaceKindForTemplate(workspace.template);
          const balanceBook =
            kind === "personal"
              ? null
              : await api.getBalances(workspace.id).catch(() => null);
          if (
            requestId !== loadRequestRef.current ||
            workspace.id !== workspaceIdRef.current
          ) {
            return;
          }
          const actorId = chrome.actor?.userId ?? "";
          const edge =
            balanceBook && actorId
              ? primaryCounterpartyEdge(balanceBook.lines, actorId)
              : null;
          const counterpartyName = edge
            ? edge.counterpartyId.startsWith("fund:")
              ? "صندوق تنخواه"
              : (members.find((member) => member.userId === edge.counterpartyId)
                  ?.displayName ?? null)
            : null;
          const peerBalances: PeerBalance[] =
            balanceBook && actorId
              ? balanceBook.lines
                  .filter((line) => line.userId !== actorId)
                  .map((line) => ({
                    userId: line.userId,
                    name:
                      members.find((m) => m.userId === line.userId)?.displayName ??
                      line.userId.slice(0, 8),
                    amountMinor: line.net.amountMinor,
                  }))
              : [];
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
              irrMinor: String(e.total.amountMinor),
              status: expenseStatusLabel(e.status),
            })),
            recentNeeds: needs.slice(0, 3).map((n) => ({
              id: n.id,
              title: n.title,
              status: needStatusLabel(n.status),
            })),
            memberNames: members.map((m) => m.displayName).filter(Boolean),
            myRole: membershipRoleOrNull(
              members.find((m) => m.userId === chrome.actor?.userId)?.role,
            ),
            financeManagerCount: members.filter(
              (m) => !m.disabledAt && isFinanceManagerRole(m.role),
            ).length,
            rangeLabel: `${formatFaDate(dashboard.from)} تا ${formatFaDate(dashboard.to)}`,
            rangeFrom: dashboard.from,
            rangeTo: dashboard.to,
            moneyPulse: dashboard.moneyPulse,
            pettyCashFunds: pettyFunds.filter((f) => f.active),
            savingsBalanceMinor: savingsFund?.balanceMinor ?? null,
            savingsGoalCount: savingsFund?.goalCount ?? 0,
            counterparty:
              edge && counterpartyName
                ? {
                    direction: edge.direction,
                    name: counterpartyName,
                    amountMinor: edge.amountMinor,
                  }
                : null,
            peerBalances,
          });
          setError(null);
        } catch (err: unknown) {
          if (
            requestId !== loadRequestRef.current ||
            workspaceId !== workspaceIdRef.current
          ) {
            return;
          }
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }

  useEffect(() => {
    if (!chrome.ready || !chrome.workspaceId) return;
    setData(null);
    setFeedItems([]);
    setError(null);
    load(chrome.workspaceId);
  }, [chrome.ready, chrome.workspaceId]);

  useEffect(() => {
    if (!slug) return;
    if (folderQuery && !homeFolder) {
      router.replace(homeDomainHref(slug));
    }
  }, [slug, folderQuery, homeFolder, router]);

  useLiveInvalidation(["expenses", "balances", "settlements", "invoices:"], () => {
    if (!chrome.ready || !chrome.workspaceId) return;
    load(chrome.workspaceId);
  });

  const spaceKind = spaceKindForTemplate(activeWs?.template);
  const { role: membershipRole } = useWorkspaceMembershipRole(chrome.workspaceId);
  const domainSections = (() => {
    const flags = spaceNavFlagsFromCapabilities(
      chrome.capabilities,
      chrome.platformRole,
    );
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

  const myNet = netFromIrrMinor(data?.balanceIrrMinor ?? 0, HOME_UNIT);
  const pulseNet = data?.moneyPulse
    ? netFromIrrMinor(data.moneyPulse.net.amountMinor, HOME_UNIT)
    : null;

  const primaryCta = spaceHomePrimaryCta(spaceKind, {
    buildingChargesLive:
      chrome.capabilities?.providers?.buildingCharges === "building_charges_v1",
    canProcure: spaceKind === "org",
  });
  const primaryHref =
    primaryCta.prefer === "procurement"
      ? procurementHref
      : primaryCta.prefer === "invoices"
        ? invoicesHref
        : recordHref;

  const actionItems = useMemo((): SpaceHomeActionItem[] => {
    if (!data || !slug) return [];
    const items: SpaceHomeActionItem[] = [];

    if (spaceKind === "group" || spaceKind === "building") {
      const peers = sortPeersByAbsNet(data.peerBalances, HOME_UNIT).slice(0, 5);
      for (const peer of peers) {
        const settleDisplay = irrMinorToDisplayInteger(
          Math.abs(peer.net.irrMinor),
          HOME_UNIT,
        ).toString();
        const href = `${settlementsHref}${settlementsHref.includes("?") ? "&" : "?"}settleTo=${encodeURIComponent(peer.userId)}&settleAmount=${settleDisplay}#settlement-panel`;
        items.push({
          id: `peer-${peer.userId}`,
          title: peer.name,
          detail:
            peer.net.tone === "debt"
              ? `${formatMoneyFromIrrMinor(Math.abs(peer.net.irrMinor), HOME_UNIT)} ${UNIT_LABEL} بدهی`
              : `${formatMoneyFromIrrMinor(peer.net.irrMinor, HOME_UNIT)} ${UNIT_LABEL} طلب`,
          href,
          actionLabel: "تسویه",
        });
      }
    }

    if (data.pendingApprovalCount > 0) {
      items.push({
        id: "approvals",
        title: "تأیید در صف",
        detail: `${data.pendingApprovalCount.toLocaleString("fa-IR")} مورد${
          data.approvalSlaBreached > 0
            ? ` · ${data.approvalSlaBreached.toLocaleString("fa-IR")} از مهلت گذشته`
            : ""
        }`,
        href: canonicalHref("approvals", slug),
        actionLabel: "بررسی",
      });
    }

    if (data.openSettlementCount > 0 && spaceKind !== "group") {
      items.push({
        id: "settlements",
        title: "تسویه باز",
        detail: `${data.openSettlementCount.toLocaleString("fa-IR")} مورد`,
        href: settlementsHref,
        actionLabel: "تسویه",
      });
    }

    if (data.needCount > 0) {
      items.push({
        id: "needs",
        title: "نیاز باز",
        detail: `${data.needCount.toLocaleString("fa-IR")} مورد`,
        href: spaceKind === "org" ? procurementHref : expensesHref,
        actionLabel: "مشاهده",
      });
    }

    return items.slice(0, 5);
  }, [
    data,
    slug,
    spaceKind,
    HOME_UNIT,
    UNIT_LABEL,
    settlementsHref,
    procurementHref,
    expensesHref,
  ]);

  const activityItems = useMemo((): SpaceHomeActivityItem[] => {
    const items: SpaceHomeActivityItem[] = [];
    if (activityLive) {
      for (const item of feedItems.slice(0, 5)) {
        items.push({
          id: item.id,
          title: item.title,
          detail: [
            item.kind === "notification" ? "اعلان" : "ممیزی",
            item.body?.trim() || null,
            formatFaDate(item.createdAt),
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
    }
    if (items.length < 5 && data) {
      for (const expense of data.recentExpenses) {
        if (items.length >= 5) break;
        items.push({
          id: `exp-${expense.id}`,
          title: expense.title,
          detail: `${expense.status} · ${formatMoneyFromIrrMinor(expense.irrMinor, HOME_UNIT)} ${UNIT_LABEL}`,
          href: `${financeHref}?expense=${encodeURIComponent(expense.id)}#expense-inspector`,
        });
      }
      for (const need of data.recentNeeds) {
        if (items.length >= 5) break;
        items.push({
          id: `need-${need.id}`,
          title: need.title,
          detail: `نیاز خرید · ${need.status}`,
          href: spaceKind === "org" ? procurementHref : expensesHref,
        });
      }
    }
    return items.slice(0, 5);
  }, [
    activityLive,
    feedItems,
    data,
    HOME_UNIT,
    UNIT_LABEL,
    financeHref,
    spaceKind,
    procurementHref,
    expensesHref,
  ]);

  const chartSeries = useMemo(() => {
    if (!chartsLive || !data?.moneyPulse) return null;
    const series = moneyPulseFlowSeries(data.moneyPulse.movements);
    return series.points.length > 0 ? series : null;
  }, [chartsLive, data]);

  const pettyTotalMinor = data?.pettyCashFunds?.length
    ? data.pettyCashFunds
        .reduce((acc, f) => acc + BigInt(f.balanceMinor || "0"), 0n)
        .toString()
    : null;

  const keyNumberNode = (() => {
    if (!data) {
      return (
        <SpaceHomeKeyNumber label="مانده" amount="—" tone="settled" />
      );
    }

    if (spaceKind === "personal" && pulseNet) {
      return (
        <SpaceHomeKeyNumber
          label={spaceHomeKeyLabel("personal", pulseNet.tone)}
          amount={
            pulseNet.tone === "settled"
              ? "صفر"
              : `${pulseNet.tone === "credit" ? "+" : "−"}${formatMoneyFromIrrMinor(Math.abs(pulseNet.irrMinor), HOME_UNIT)} ${UNIT_LABEL}`
          }
          tone={pulseNet.tone}
          meta={
            <>
              <span>
                درآمد{" "}
                {formatMoneyFromIrrMinor(data.moneyPulse.income.amountMinor, HOME_UNIT)}{" "}
                {UNIT_LABEL}
              </span>
              <span>
                خرج{" "}
                {formatMoneyFromIrrMinor(data.moneyPulse.expense.amountMinor, HOME_UNIT)}{" "}
                {UNIT_LABEL}
              </span>
            </>
          }
        />
      );
    }

    if (spaceKind === "org") {
      return (
        <SpaceHomeKeyNumber
          label={spaceHomeKeyLabel("org", "settled")}
          amount={
            data.pendingApprovalCount > 0
              ? `${data.pendingApprovalCount.toLocaleString("fa-IR")} تأیید باز`
              : "صف تأیید خالی"
          }
          tone={data.pendingApprovalCount > 0 ? "debt" : "settled"}
          meta={
            pettyTotalMinor != null ? (
              <span>
                تنخواه{" "}
                {formatMoneyFromIrrMinor(pettyTotalMinor, HOME_UNIT)} {UNIT_LABEL}
              </span>
            ) : data.persistence ? (
              <span>{data.persistence}</span>
            ) : null
          }
        />
      );
    }

    if (spaceKind === "building") {
      const unpaidHint =
        data.openSettlementCount > 0
          ? `${data.openSettlementCount.toLocaleString("fa-IR")} تسویه/شارژ باز`
          : data.needCount > 0
            ? `${data.needCount.toLocaleString("fa-IR")} نیاز باز`
            : "بدهی بازی نیست";
      return (
        <SpaceHomeKeyNumber
          label={spaceHomeKeyLabel("building", "settled")}
          amount={unpaidHint}
          tone={
            data.openSettlementCount > 0 || data.needCount > 0 ? "debt" : "settled"
          }
          meta={
            pettyTotalMinor != null ? (
              <span>
                صندوق{" "}
                {formatMoneyFromIrrMinor(pettyTotalMinor, HOME_UNIT)} {UNIT_LABEL}
              </span>
            ) : null
          }
        />
      );
    }

    // group (default)
    return (
      <SpaceHomeKeyNumber
        label={spaceHomeKeyLabel("group", myNet.tone)}
        amount={
          balance === "—"
            ? "—"
            : myNet.tone === "settled"
              ? data.openSettlementCount > 0
                ? `${data.openSettlementCount.toLocaleString("fa-IR")} تسویه در جریان`
                : "تسویه"
              : `${myNet.tone === "credit" ? "+" : "−"}${balance} ${UNIT_LABEL}`
        }
        tone={myNet.tone}
        meta={
          <>
            {data.counterparty ? (
              <span>
                {data.counterparty.direction === "debt" ? "بیشترین بدهی به" : "بیشترین طلب از"}{" "}
                {data.counterparty.name}
              </span>
            ) : null}
            {data.postedCount > 0 ? (
              <span>{data.postedCount.toLocaleString("fa-IR")} خرج ثبت‌شده</span>
            ) : null}
          </>
        }
      />
    );
  })();

  const secondaryAction =
    (spaceKind === "group" || spaceKind === "building") &&
    (myNet.tone !== "settled" || (data?.openSettlementCount ?? 0) > 0) ? (
      <Link href={settlementsHref} className="dang-btn dang-btn--md dang-btn--ghost">
        تسویه
      </Link>
    ) : spaceKind === "org" && (data?.pendingApprovalCount ?? 0) > 0 ? (
      <Link
        href={canonicalHref("approvals", slug)}
        className="dang-btn dang-btn--md dang-btn--ghost"
      >
        صف تأیید
      </Link>
    ) : spaceKind === "personal" && slug ? (
      <Link href="/me/finance#goals" className="dang-btn dang-btn--md dang-btn--ghost">
        پس‌انداز
      </Link>
    ) : null;

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

      <WorkspacePageFrame title="" state="ready">
        {!chrome.ready ||
        (!data && Boolean(chrome.workspaceId) && (pending || !error)) ? (
          <LoadingState label="در حال بارگذاری خانه…" rows={4} />
        ) : error && !data ? (
          <ErrorState
            title={error}
            action={
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
            }
          />
        ) : !slug ? (
          <EmptyHint>فضای کاری را انتخاب کنید یا از فهرست فضاها یکی بسازید.</EmptyHint>
        ) : homeFolder ? (
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
        ) : (
          <SpaceHomeLayout
            title={activeWs?.name || data?.workspaceName || NAV_LABELS.home}
            roleBadge={
              data?.myRole ? membershipRoleLabel(data.myRole) : null
            }
            primaryAction={
              !isReadOnlyRole(data?.myRole) ? (
                <Link
                  href={primaryHref}
                  className="dang-btn dang-btn--md dang-btn--primary"
                >
                  {primaryCta.label}
                </Link>
              ) : undefined
            }
            secondaryAction={secondaryAction}
            stats={
            spaceKind === "personal" ||
            chrome.capabilities?.providers?.pettyCash === "fund_v1" ? (
              <TreasuryBalanceCard
                spaceKind={spaceKind}
                funds={data?.pettyCashFunds ?? []}
                paymentsHref={canonicalHref("payments", slug)}
                savingsHref="/me/finance#goals"
                canManage={isFinanceManagerRole(data?.myRole)}
                pending={pending}
                density="compact"
                savingsBalanceMinor={
                  spaceKind === "personal" ? data?.savingsBalanceMinor : null
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
            ) : null
            }
            keyNumber={keyNumberNode}
            actions={<SpaceHomeActions items={actionItems} />}
            activity={<SpaceHomeActivity items={activityItems} />}
            chart={
              chartSeries && slug ? (
                <SpaceHomeMiniChart slug={slug} series={chartSeries} />
              ) : null
            }
            extras={
              <>
                {spaceKind === "personal" &&
                data?.workspaceId &&
                !isReadOnlyRole(data?.myRole) ? (
                  <PersonalHomeExtras
                    workspaceId={data.workspaceId}
                    onPosted={() => {
                      if (chrome.workspaceId) load(chrome.workspaceId);
                    }}
                    onError={setError}
                  />
                ) : null}
                {spaceKind === "personal" && !isReadOnlyRole(data?.myRole) ? (
                  <MoneyEntryChooser slug={slug} />
                ) : null}
                {spaceKind === "group" && data?.workspaceId && slug ? (
                  <GroupOutingHomePanel
                    workspaceId={data.workspaceId}
                    slug={slug}
                    myRole={data.myRole}
                    onError={setError}
                  />
                ) : null}
                {slug &&
                chrome.workspaceId &&
                (spaceKind === "building" || spaceKind === "org") ? (
                  <StructuralSubunitsRail
                    workspaceId={chrome.workspaceId}
                    slug={slug}
                    spaceKind={spaceKind}
                    myRole={data?.myRole}
                  />
                ) : null}
                {slug &&
                (spaceKind === "group" ||
                  spaceKind === "building" ||
                  spaceKind === "org") ? (
                  <details className={spaceHomeStyles.collapsedExtra}>
                    <summary>شناسهٔ عمومی فضا</summary>
                    <GroupPublicIdCard slug={slug} name={data?.workspaceName} />
                  </details>
                ) : null}
                {slug &&
                (spaceKind === "group" || spaceKind === "building") &&
                data &&
                data.memberNames.length < 2 ? (
                  <GroupSetupChecklist
                    slug={slug}
                    memberCount={data.memberNames.length}
                    financeManagerCount={data.financeManagerCount}
                    postedCount={data.postedCount}
                    canManageMembers={
                      data.myRole === "owner" ||
                      data.myRole === "admin" ||
                      isFinanceManagerRole(data.myRole)
                    }
                    canAddExpense={!isReadOnlyRole(data.myRole)}
                  />
                ) : null}
                {data &&
                navUsageTierFromCounts({
                  postedExpenseCount: data.postedCount,
                  memberCount: data.memberNames.length,
                }) === "starter" ? (
                  <StatusLine>
                    نمای ساده برای فضای تازه‌کار — مسیرهای پیشرفته از منوی بخش‌ها در دسترس‌اند.
                  </StatusLine>
                ) : null}
                {allowDemoSeed ? (
                  <details className={spaceHomeStyles.collapsedExtra}>
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
              </>
            }
          />
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
