"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ShellIcon } from "@/components/app-shell";
import {
  ContextualMosaicHub,
  type ContextualMosaicFact,
} from "@/components/shell/contextual-mosaic-hub";
import { FrequentDestinationsRail } from "@/components/shell/frequent-destinations-rail";
import { MosaicBackBar } from "@/components/shell/mosaic-back-bar";
import { EmptyHint } from "@/components/ui-blocks";
import {
  DOMAIN_GROUP_GEM,
  DOMAIN_GROUP_ORDER,
  domainDrillMosaicSections,
  domainGroupHint,
  domainGroupLabel,
  domainSubGroupLabel,
  homeDomainHref,
  parseDomainSubGroup,
  type ContextualMosaicItem,
  type ContextualMosaicSection,
  type DomainGroupKey,
} from "@/lib/navigation-v2";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { spaceKindForTemplate, type WorkspaceTemplate } from "@dang/contracts";
import { useAdaptiveMosaicMode } from "@/lib/use-viewport";
import { navigateWithViewTransition } from "@/lib/tile-press";
import { wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";

const DOMAIN_ICON: Record<DomainGroupKey, ShellIcon> = {
  finance: "wallet",
  buy: "cart",
  people: "partners",
  oversight: "search",
  settings: "settings",
};

/**
 * Mosaic workspace home: every gated leaf is its own tile (finance, ledger, …),
 * per space kind. Desktop ≥1200px uses Operations Room split (domains + content).
 */
export function HomeRootLauncher({
  slug,
  template,
  workspaceCount,
  sections,
  folderParam,
  groupParam = null,
  facts = {},
  pinnedHrefs,
  onTogglePin,
  reduceMotion = false,
  urgency = {},
}: {
  slug: string | null;
  template: WorkspaceTemplate | undefined;
  workspaceCount: number;
  sections: ContextualMosaicSection[];
  folderParam: DomainGroupKey | null;
  groupParam?: string | null;
  facts?: Partial<Record<string, ContextualMosaicFact>>;
  pinnedHrefs?: ReadonlySet<string>;
  onTogglePin?: (item: { key: string; label: string; href: string }) => void;
  reduceMotion?: boolean;
  urgency?: {
    pendingApprovals?: number;
    openSettlements?: number;
    openNeeds?: number;
  };
}) {
  const router = useRouter();
  const mosaicMode = useAdaptiveMosaicMode();
  const opsRoom = mosaicMode === "operations-room";
  const hybrid = mosaicMode === "hybrid";
  const kind = spaceKindForTemplate(template);
  const inFolder = Boolean(folderParam);
  const activeGroup =
    folderParam && groupParam
      ? parseDomainSubGroup(folderParam, groupParam)
      : null;
  const [freqRefresh, setFreqRefresh] = useState(0);

  const folderCounts = useMemo(() => {
    const counts = Object.fromEntries(
      DOMAIN_GROUP_ORDER.map((key) => [key, 0]),
    ) as Record<DomainGroupKey, number>;
    for (const section of sections) {
      const key = section.key as DomainGroupKey;
      if (DOMAIN_GROUP_ORDER.includes(key)) counts[key] = section.items.length;
    }
    return counts;
  }, [sections]);

  const activeSection = folderParam
    ? sections.find((section) => section.key === folderParam)
    : null;

  const liveHrefs = useMemo(() => {
    const hrefs = new Set<string>();
    for (const section of sections) {
      for (const item of section.items) hrefs.add(item.href);
    }
    if (slug) {
      hrefs.add(wPath(slug, "space"));
      hrefs.add(wPath(slug, "expenses"));
      hrefs.add(wPath(slug, "record"));
      hrefs.add(`${wPath(slug, "expenses")}#quick-expense`);
    }
    hrefs.add("/home");
    return hrefs;
  }, [sections, slug]);

  const financeAttention =
    (urgency.pendingApprovals ?? 0) + (urgency.openSettlements ?? 0);
  const buyAttention = urgency.openNeeds ?? 0;

  useEffect(() => {
    if (!inFolder || !slug || opsRoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (activeGroup && folderParam) {
        router.push(homeDomainHref(slug, folderParam));
        return;
      }
      router.push(homeDomainHref(slug));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inFolder, slug, router, activeGroup, folderParam, opsRoom]);

  const wrappedTogglePin = onTogglePin
    ? (item: { key: string; label: string; href: string }) => {
        onTogglePin(item);
        setFreqRefresh((n) => n + 1);
      }
    : undefined;

  if (!slug) {
    return <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>;
  }

  const domainNav = (
    <nav className="mosaicOps__domains" aria-label={t("shell.opsRoomDomains")}>
      <h2 className="mosaicOps__domainsTitle">{t("shell.opsRoomDomains")}</h2>
      <ul className="mosaicOps__domainList">
        {DOMAIN_GROUP_ORDER.map((domain) => {
          const count = folderCounts[domain];
          if (count <= 0) return null;
          const href = homeDomainHref(slug, domain);
          const active = folderParam === domain;
          return (
            <li key={domain}>
              <Link
                href={href}
                className={`mosaicOps__domainLink${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    event.button !== 0
                  ) {
                    return;
                  }
                  event.preventDefault();
                  navigateWithViewTransition(() => {
                    router.push(href);
                  }, reduceMotion);
                }}
              >
                <strong>{domainGroupLabel(domain)}</strong>
                <small>{count.toLocaleString("fa-IR")}</small>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const folderContent =
    inFolder && folderParam && activeSection && activeSection.items.length > 0 ? (
      <ContextualMosaicHub
        sections={domainDrillMosaicSections(folderParam, activeSection, {
          slug,
          folderBase: "home",
          group: groupParam,
        })}
        title={
          activeGroup
            ? domainSubGroupLabel(folderParam, activeGroup)
            : domainGroupLabel(folderParam)
        }
        description={domainGroupHint(folderParam)}
        facts={facts}
        compact
        headingId="home-domains-folder-title"
        reduceMotion={reduceMotion}
        pinnedHrefs={pinnedHrefs}
        onTogglePin={wrappedTogglePin}
        onDestinationRemembered={() => setFreqRefresh((n) => n + 1)}
      />
    ) : inFolder && folderParam ? (
      <EmptyHint>
        {t("shell.toolsFolderEmpty")}{" "}
        <Link href={homeDomainHref(slug)}>{t("shell.toolsBackToFolders")}</Link>
      </EmptyHint>
    ) : null;

  // Mobile/tablet launcher: full drill-down (existing behavior).
  if (!opsRoom && inFolder && folderParam) {
    if (!activeSection || activeSection.items.length === 0) {
      return (
        <EmptyHint>
          {t("shell.toolsFolderEmpty")}{" "}
          <Link href={homeDomainHref(slug)}>{t("shell.toolsBackToFolders")}</Link>
        </EmptyHint>
      );
    }
    const crumbs = activeGroup
      ? [
          { label: t("shell.toolsBackFolders"), href: homeDomainHref(slug) },
          {
            label: domainGroupLabel(folderParam),
            href: homeDomainHref(slug, folderParam),
          },
          { label: domainSubGroupLabel(folderParam, activeGroup) },
        ]
      : [
          { label: t("shell.toolsBackFolders"), href: homeDomainHref(slug) },
          { label: domainGroupLabel(folderParam) },
        ];
    return (
      <div
        className={`mosaicLauncher mosaicLauncher--drill${hybrid ? " mosaicLauncher--hybrid" : ""}`}
        key={`${folderParam}-${groupParam ?? ""}`}
      >
        <MosaicBackBar
          backHref={
            activeGroup
              ? homeDomainHref(slug, folderParam)
              : homeDomainHref(slug)
          }
          crumbs={crumbs}
        />
        <FrequentDestinationsRail
          liveHrefs={liveHrefs}
          reduceMotion={reduceMotion}
          refreshKey={freqRefresh}
        />
        {folderContent}
      </div>
    );
  }

  const quickItems: ContextualMosaicItem[] = [
    {
      key: "this-space",
      href: wPath(slug, "space"),
      label: spaceTabLabel(kind),
      icon: "home",
      summary: t("shell.homeThisSpaceHint"),
      intent: "manage",
      gemKey: "teal",
    },
    {
      key: "my-spaces",
      href: "/home",
      label: NAV_LABELS.home,
      icon: "partners",
      summary: t("shell.homeMySpacesHint"),
      intent: "manage",
      gemKey: "blue",
    },
    {
      key: "add-expense",
      href: wPath(slug, "record"),
      label: NAV_LABELS.addExpense,
      icon: "receipt",
      summary: "انتخاب شغل: ثبت روزانه یا خرج کامل",
      intent: "record",
      gemKey: "amber",
    },
  ];

  if (!opsRoom) {
    for (const domain of DOMAIN_GROUP_ORDER) {
      const count = folderCounts[domain];
      if (count <= 0) continue;
      quickItems.push({
        key: `folder-${domain}`,
        href: homeDomainHref(slug, domain),
        label: domainGroupLabel(domain),
        icon: DOMAIN_ICON[domain],
        summary: `${domainGroupHint(domain)} · ${count.toLocaleString("fa-IR")} مسیر`,
        intent:
          domain === "finance"
            ? "record"
            : domain === "oversight"
              ? "monitor"
              : "manage",
        gemKey: DOMAIN_GROUP_GEM[domain],
      });
    }
  }

  const rootFacts: Partial<Record<string, ContextualMosaicFact>> = { ...facts };
  if (financeAttention > 0) {
    rootFacts.finance = {
      label: t("shell.homeFinanceUrgencyHint"),
      value: financeAttention > 9 ? "۹+" : String(financeAttention),
      tone: "attention",
    };
    rootFacts["folder-finance"] = rootFacts.finance;
  }
  if (buyAttention > 0) {
    rootFacts.buy = {
      label: "نیاز باز",
      value: buyAttention > 9 ? "۹+" : String(buyAttention),
      tone: "attention",
    };
    rootFacts["folder-buy"] = rootFacts.buy;
  }
  if (workspaceCount > 0) {
    rootFacts["my-spaces"] = {
      label: "فضا",
      value: workspaceCount.toLocaleString("fa-IR"),
      tone: "neutral",
    };
  }

  const leafSections = sections.filter((section) => section.items.length > 0);

  const rootHub = (
    <ContextualMosaicHub
      sections={[
        {
          key: "home-quick",
          label: t("shell.homeRootTitle"),
          description: t("shell.homeRootHint"),
          items: quickItems,
        },
        ...(opsRoom ? [] : leafSections),
      ]}
      title={t("shell.homeRootTitle")}
      description={t("shell.homeRootHint")}
      facts={rootFacts}
      compact
      headingId="home-root-title"
      reduceMotion={reduceMotion}
      pinnedHrefs={pinnedHrefs}
      onTogglePin={wrappedTogglePin}
      onDestinationRemembered={() => setFreqRefresh((n) => n + 1)}
    />
  );

  if (opsRoom) {
    return (
      <section
        className="mosaicLauncher mosaicLauncher--opsRoom"
        aria-labelledby="home-root-title"
      >
        <p className="mosaicLauncher__eyebrow">{t("shell.opsRoomEyebrow")}</p>
        <FrequentDestinationsRail
          liveHrefs={liveHrefs}
          reduceMotion={reduceMotion}
          refreshKey={freqRefresh}
        />
        <div className="mosaicOps">
          {domainNav}
          <div className="mosaicOps__main">
            {folderContent ?? (
              <>
                {rootHub}
                <p className="mosaicOps__pickHint">{t("shell.opsRoomPickDomain")}</p>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mosaicLauncher" aria-labelledby="home-root-title">
      <p className="mosaicLauncher__eyebrow">{t("shell.homeLauncherEyebrow")}</p>
      <FrequentDestinationsRail
        liveHrefs={liveHrefs}
        reduceMotion={reduceMotion}
        refreshKey={freqRefresh}
      />
      {rootHub}
    </section>
  );
}
