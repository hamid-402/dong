"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { ShellIcon } from "@/components/app-shell";
import {
  ContextualMosaicHub,
  type ContextualMosaicFact,
} from "@/components/shell/contextual-mosaic-hub";
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
 * per space kind. Optional `?folder=` still focuses one domain.
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
  const kind = spaceKindForTemplate(template);
  const inFolder = Boolean(folderParam);
  const activeGroup =
    folderParam && groupParam
      ? parseDomainSubGroup(folderParam, groupParam)
      : null;

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

  const financeAttention =
    (urgency.pendingApprovals ?? 0) + (urgency.openSettlements ?? 0);
  const buyAttention = urgency.openNeeds ?? 0;

  useEffect(() => {
    if (!inFolder || !slug) return;
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
  }, [inFolder, slug, router, activeGroup, folderParam]);

  if (!slug) {
    return <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>;
  }

  if (inFolder && folderParam) {
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
      <div className="mosaicLauncher mosaicLauncher--drill" key={`${folderParam}-${groupParam ?? ""}`}>
        <MosaicBackBar
          backHref={
            activeGroup
              ? homeDomainHref(slug, folderParam)
              : homeDomainHref(slug)
          }
          crumbs={crumbs}
        />
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
          onTogglePin={onTogglePin}
        />
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
      href: "/spaces",
      label: NAV_LABELS.spacesList,
      icon: "partners",
      summary: t("shell.homeMySpacesHint"),
      intent: "manage",
      gemKey: "blue",
    },
    {
      key: "add-expense",
      href: `${wPath(slug, "expenses")}#quick-expense`,
      label: NAV_LABELS.addExpense,
      icon: "receipt",
      summary: "ثبت سریع خرج در دفتر همین فضا",
      intent: "record",
      gemKey: "amber",
    },
  ];

  for (const domain of DOMAIN_GROUP_ORDER) {
    const count = folderCounts[domain];
    if (count <= 0) continue;
    quickItems.push({
      key: `folder-${domain}`,
      href: homeDomainHref(slug, domain),
      label: domainGroupLabel(domain),
      icon: DOMAIN_ICON[domain],
      summary: `${domainGroupHint(domain)} · ${count.toLocaleString("fa-IR")} مسیر`,
      intent: domain === "finance" ? "record" : domain === "oversight" ? "monitor" : "manage",
      gemKey: DOMAIN_GROUP_GEM[domain],
    });
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

  return (
    <section className="mosaicLauncher" aria-labelledby="home-root-title">
      <p className="mosaicLauncher__eyebrow">
        همهٔ قابلیت‌های مجاز این فضا — هر کاشی یک مسیر واقعی است.
      </p>
      <ContextualMosaicHub
        sections={[
          {
            key: "home-quick",
            label: t("shell.homeRootTitle"),
            description: t("shell.homeRootHint"),
            items: quickItems,
          },
          ...leafSections,
        ]}
        title={t("shell.homeRootTitle")}
        description={t("shell.homeRootHint")}
        facts={rootFacts}
        compact
        headingId="home-root-title"
        reduceMotion={reduceMotion}
        pinnedHrefs={pinnedHrefs}
        onTogglePin={onTogglePin}
      />
    </section>
  );
}
