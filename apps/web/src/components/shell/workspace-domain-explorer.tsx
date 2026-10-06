"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  ContextualMosaicHub,
  type ContextualMosaicFact,
} from "@/components/shell/contextual-mosaic-hub";
import { MosaicBackBar } from "@/components/shell/mosaic-back-bar";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import {
  DOMAIN_GROUP_GEM,
  DOMAIN_GROUP_ORDER,
  domainDrillMosaicSections,
  domainGroupHint,
  domainGroupLabel,
  domainSubGroupLabel,
  parseDomainSubGroup,
  workspaceFolderHref,
  type ContextualMosaicSection,
  type DomainFolderBase,
  type DomainGroupKey,
} from "@/lib/navigation-v2";
import { gemCssVars } from "@/lib/tile-gem-palettes";
import { prefetchRoute, softTileHaptic } from "@/lib/tile-press";
import { t } from "@/lib/i18n";

export function WorkspaceDomainExplorer({
  slug,
  sections,
  folderParam,
  folderBase,
  groupParam = null,
  facts = {},
  pinnedHrefs,
  onTogglePin,
  reduceMotion = false,
  headingIdPrefix = "workspace-domains",
  hideEmptyDomains = true,
  showInlineBack = false,
}: {
  slug: string | null;
  sections: ContextualMosaicSection[];
  folderParam: DomainGroupKey | null;
  folderBase: DomainFolderBase;
  groupParam?: string | null;
  facts?: Partial<Record<string, ContextualMosaicFact>>;
  pinnedHrefs?: ReadonlySet<string>;
  onTogglePin?: (item: { key: string; label: string; href: string }) => void;
  reduceMotion?: boolean;
  headingIdPrefix?: string;
  /** When true, root grid skips domains with zero gated destinations. */
  hideEmptyDomains?: boolean;
  /** When the page frame already exposes «back to folders», keep this false. */
  showInlineBack?: boolean;
}) {
  const router = useRouter();
  const inFolder = Boolean(folderParam);
  const activeSection = folderParam
    ? sections.find((section) => section.key === folderParam)
    : null;
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
      if (DOMAIN_GROUP_ORDER.includes(key)) {
        counts[key] = section.items.length;
      }
    }
    return counts;
  }, [sections]);

  const visibleDomains = useMemo(() => {
    return DOMAIN_GROUP_ORDER.filter((domain) => {
      const count = folderCounts[domain];
      if (hideEmptyDomains && count === 0) return false;
      return true;
    });
  }, [folderCounts, hideEmptyDomains]);

  useEffect(() => {
    if (!inFolder || !slug) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (activeGroup && folderParam) {
        router.push(workspaceFolderHref(slug, folderBase, folderParam));
        return;
      }
      router.push(workspaceFolderHref(slug, folderBase));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inFolder, slug, router, folderBase, activeGroup, folderParam]);

  if (inFolder && folderParam) {
    if (!activeSection || activeSection.items.length === 0) {
      return (
        <EmptyHint>
          {t("shell.toolsFolderEmpty")}{" "}
          {slug ? (
            <Link href={workspaceFolderHref(slug, folderBase)}>
              {t("shell.toolsBackToFolders")}
            </Link>
          ) : null}
        </EmptyHint>
      );
    }

    return (
      <div className="mosaicLauncher mosaicLauncher--drill">
        {showInlineBack && slug ? (
          <MosaicBackBar
            backHref={
              activeGroup
                ? workspaceFolderHref(slug, folderBase, folderParam)
                : workspaceFolderHref(slug, folderBase)
            }
            crumbs={
              activeGroup
                ? [
                    {
                      label: t("shell.toolsBackFolders"),
                      href: workspaceFolderHref(slug, folderBase),
                    },
                    {
                      label: domainGroupLabel(folderParam),
                      href: workspaceFolderHref(slug, folderBase, folderParam),
                    },
                    { label: domainSubGroupLabel(folderParam, activeGroup) },
                  ]
                : [
                    {
                      label: t("shell.toolsBackFolders"),
                      href: workspaceFolderHref(slug, folderBase),
                    },
                    { label: domainGroupLabel(folderParam) },
                  ]
            }
          />
        ) : null}
        <ContextualMosaicHub
          sections={domainDrillMosaicSections(folderParam, activeSection, {
            slug: slug!,
            folderBase,
            group: groupParam,
          })}
          title={
            activeGroup
              ? domainSubGroupLabel(folderParam, activeGroup)
              : domainGroupLabel(folderParam)
          }
          description={domainGroupHint(folderParam)}
          facts={facts}
          headingId={`${headingIdPrefix}-folder-title`}
          compact
          reduceMotion={reduceMotion}
          pinnedHrefs={pinnedHrefs}
          onTogglePin={onTogglePin}
        />
      </div>
    );
  }

  if (visibleDomains.length === 0) {
    return (
      <EmptyHint>
        {t("shell.toolsFolderEmpty")}{" "}
        {slug ? (
          <Link href={workspaceFolderHref(slug, folderBase)}>
            {t("shell.toolsBackToFolders")}
          </Link>
        ) : null}
      </EmptyHint>
    );
  }

  const foldersHeadingId = `${headingIdPrefix}-folders`;
  const foldersHint =
    folderBase === "home" ? t("shell.homeWorkFoldersHint") : t("shell.toolsWorkFoldersHint");
  const foldersTitle =
    folderBase === "home" ? t("shell.homeWorkFolders") : t("shell.toolsWorkFolders");

  return (
    <section className="shell-tools__folders workspace-domain-explorer" aria-labelledby={foldersHeadingId}>
      <h2 id={foldersHeadingId} className="shell-tools__heading">
        {foldersTitle}
      </h2>
      <StatusLine>{foldersHint}</StatusLine>
      <ul className="shell-tools__folder-grid">
        {visibleDomains.map((domain) => {
          const count = folderCounts[domain];
          const enabled = count > 0 && Boolean(slug);
          const href = enabled && slug ? workspaceFolderHref(slug, folderBase, domain) : null;
          const tileStyle = gemCssVars(DOMAIN_GROUP_GEM[domain]);
          return (
            <li key={domain}>
              {href ? (
                <Link
                  href={href}
                  className="dang-gem shell-tools__folder-tile"
                  style={tileStyle}
                  onMouseEnter={() => prefetchRoute(router, href)}
                  onFocus={() => prefetchRoute(router, href)}
                  onTouchStart={() => prefetchRoute(router, href)}
                  onPointerDown={() => softTileHaptic()}
                >
                  <span className="shell-tools__folder-count">{count}</span>
                  <strong>{domainGroupLabel(domain)}</strong>
                  <small>
                    {domainGroupHint(domain)}
                    {" · "}
                    {t("shell.toolsCount", { count })}
                  </small>
                </Link>
              ) : (
                <span
                  className="dang-gem shell-tools__folder-tile is-disabled"
                  style={tileStyle}
                  aria-disabled="true"
                >
                  <span className="shell-tools__folder-count">{count}</span>
                  <strong>{domainGroupLabel(domain)}</strong>
                  <small>{t("shell.toolsEmpty")}</small>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
