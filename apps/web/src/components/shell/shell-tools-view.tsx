"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ContextualMosaicHub } from "@/components/shell/contextual-mosaic-hub";
import { WorkspaceDomainExplorer } from "@/components/shell/workspace-domain-explorer";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import {
  contextualAccountNav,
  contextualMosaicSections,
  domainGroupHint,
  domainGroupLabel,
  domainSubGroupLabel,
  moreDomainHref,
  moreIntentHref,
  parseDomainGroup,
  parseDomainSubGroup,
  parseMosaicIntent,
} from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  listRecentDestinations,
  type RecentDestination,
} from "@/lib/recent-destinations";
import {
  filterLivePinned,
  listPinnedDestinations,
  togglePinnedDestination,
  type PinnedDestination,
} from "@/lib/pinned-destinations";
import { spaceNavFlagsFromCapabilities } from "@/lib/workspace-page-access";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { slugFromPathname } from "@/lib/workspace-storage";
import { wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";
import { gemCssVars } from "@/lib/tile-gem-palettes";

function sameHrefList(a: PinnedDestination[] | RecentDestination[], b: { href: string }[]) {
  if (a.length !== b.length) return false;
  return a.every((row, index) => row.href === b[index]?.href);
}

/** Mosaic-style tool launcher — domain folders, pins, recent. */
export function ShellToolsView() {
  const chrome = useAppChrome();
  const shell = useShellV2Api();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderQuery = searchParams.get("folder");
  const intentQuery = searchParams.get("intent");
  const groupQuery = searchParams.get("group");
  const active = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = slugFromPathname(pathname) ?? active?.slug ?? null;
  const { role: membershipRole } = useWorkspaceMembershipRole(chrome.workspaceId);
  const legacyIntent = parseMosaicIntent(intentQuery);
  const domainParam =
    parseDomainGroup(folderQuery) ??
    (legacyIntent
      ? parseDomainGroup(
          new URL(
            moreIntentHref(slug ?? "_", legacyIntent),
            "https://dang.local",
          ).searchParams.get("folder"),
        )
      : null);
  const groupParsed =
    domainParam != null ? parseDomainSubGroup(domainParam, groupQuery) : null;
  const flagsKey = JSON.stringify(spaceNavFlagsFromCapabilities(chrome.capabilities));

  const sections = useMemo(
    () =>
      contextualMosaicSections(
        active?.template,
        slug,
        JSON.parse(flagsKey) as ReturnType<typeof spaceNavFlagsFromCapabilities>,
        "all",
        membershipRole || null,
      ),
    [active?.template, slug, flagsKey, membershipRole],
  );
  const accountItems = useMemo(
    () =>
      contextualAccountNav({
        platformAdminLive:
          chrome.capabilities?.providers?.platformAdmin === "platform_v1",
        platformRole: chrome.platformRole,
      }),
    [chrome.capabilities?.providers?.platformAdmin, chrome.platformRole],
  );

  const liveHrefKey = useMemo(() => {
    const hrefs: string[] = [];
    for (const section of sections) {
      for (const item of section.items) hrefs.push(item.href);
    }
    for (const item of accountItems) hrefs.push(item.href);
    return hrefs.sort().join("|");
  }, [sections, accountItems]);

  const liveHrefs = useMemo(() => {
    if (!liveHrefKey) return new Set<string>();
    return new Set(liveHrefKey.split("|"));
  }, [liveHrefKey]);

  const [recent, setRecent] = useState<RecentDestination[]>([]);
  const [pins, setPins] = useState<PinnedDestination[]>([]);

  useEffect(() => {
    const nextRecent = listRecentDestinations();
    const nextPins = filterLivePinned(listPinnedDestinations(), liveHrefs);
    setRecent((prev) => (sameHrefList(prev, nextRecent) ? prev : nextRecent));
    setPins((prev) => (sameHrefList(prev, nextPins) ? prev : nextPins));
  }, [pathname, folderQuery, intentQuery, liveHrefKey, liveHrefs]);

  useEffect(() => {
    if (!slug) return;
    if (intentQuery && !folderQuery) {
      const intent = parseMosaicIntent(intentQuery);
      if (intent) {
        router.replace(moreIntentHref(slug, intent));
        return;
      }
      router.replace(moreDomainHref(slug));
      return;
    }
    if (folderQuery && !parseDomainGroup(folderQuery)) {
      router.replace(moreDomainHref(slug));
      return;
    }
    // Keep domain folders on More (do not bounce to home) so back + trail work.
  }, [slug, intentQuery, folderQuery, router]);

  const pinnedHrefSet = useMemo(
    () => new Set(pins.map((pin) => pin.href)),
    [pins],
  );

  function refreshPins() {
    setPins(filterLivePinned(listPinnedDestinations(), liveHrefs));
  }

  const toolCount = sections.reduce((n, s) => n + s.items.length, 0);
  const flatItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  // Flat catalog only on the More root — keep folder drill for subgroups.
  const useFlatCatalog =
    !domainParam && flatItems.length > 0 && flatItems.length <= 6;

  return (
    <WorkspacePageFrame
      title={
        groupParsed && domainParam
          ? domainSubGroupLabel(domainParam, groupParsed)
          : domainParam
            ? domainGroupLabel(domainParam)
            : NAV_LABELS.more
      }
      description={
        domainParam ? domainGroupHint(domainParam) : t("shell.toolsAppDesc")
      }
      primaryAction={
        slug ? (
          domainParam ? (
            <Link
              href={
                groupParsed
                  ? moreDomainHref(slug, domainParam)
                  : moreDomainHref(slug)
              }
            >
              {groupParsed
                ? `← ${domainGroupLabel(domainParam)}`
                : t("shell.toolsBackFolders")}
            </Link>
          ) : (
            <Link href={wPath(slug)}>{NAV_LABELS.home}</Link>
          )
        ) : (
          <Link href="/home">{NAV_LABELS.spacesList}</Link>
        )
      }
      state={!chrome.ready ? "loading" : toolCount === 0 && !slug ? "empty" : "ready"}
      loadingLabel={t("shell.toolsLoading")}
      empty={
        <EmptyHint>
          {t("shell.toolsNoWorkspaceBefore")}{" "}
          <Link href="/home">{t("shell.toolsMySpaces")}</Link>{" "}
          {t("shell.toolsNoWorkspaceAfter")}
        </EmptyHint>
      }
    >
      <div className="shell-tools">
        <p className="shell-tools__search-row">
          <button
            type="button"
            className="shell-tools__search-btn"
            onClick={() => shell?.openCommandPalette()}
          >
            {t("shell.toolsSearch")}
            <kbd aria-hidden>Ctrl+K</kbd>
          </button>
        </p>
        {pins.length > 0 ? (
          <section className="shell-tools__recent" aria-labelledby="tools-pinned">
            <h2 id="tools-pinned" className="shell-tools__heading">
              {t("shell.toolsPinned")}
            </h2>
            <StatusLine>{t("shell.toolsPinnedHint")}</StatusLine>
            <ul className="shell-tools__recent-list">
              {pins.map((item) => (
                <li key={`pin:${item.href}`}>
                  <Link href={item.href} className="shell-tools__recent-chip is-pinned">
                    ★ {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recent.length > 0 ? (
          <section className="shell-tools__recent" aria-labelledby="tools-recent">
            <h2 id="tools-recent" className="shell-tools__heading">
              {t("shell.toolsRecent")}
            </h2>
            <StatusLine>{t("shell.toolsRecentHint")}</StatusLine>
            <ul className="shell-tools__recent-list">
              {recent.map((item) => (
                <li key={`${item.key}:${item.href}`}>
                  <Link href={item.href} className="shell-tools__recent-chip">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {useFlatCatalog ? (
          <ContextualMosaicHub
            sections={[
              {
                key: "all-tools",
                label: NAV_LABELS.more,
                items: flatItems,
              },
            ]}
            title={NAV_LABELS.more}
            description={t("shell.toolsFlatTiles")}
            headingId="workspace-tools-flat-title"
            compact
            pinnedHrefs={pinnedHrefSet}
            onTogglePin={(item) => {
              togglePinnedDestination(item);
              refreshPins();
            }}
          />
        ) : (
          <>
            {!domainParam ? (
              <StatusLine>{t("shell.toolsAlsoOnHome")}</StatusLine>
            ) : null}
            <WorkspaceDomainExplorer
              slug={slug}
              sections={sections}
              folderParam={domainParam}
              folderBase="more"
              groupParam={groupQuery}
              showInlineBack
              headingIdPrefix="workspace-tools"
              hideEmptyDomains={false}
              pinnedHrefs={pinnedHrefSet}
              onTogglePin={(item) => {
                togglePinnedDestination(item);
                refreshPins();
              }}
            />
          </>
        )}

        <ContextualMosaicHub
          sections={[
            {
              key: "account",
              label: NAV_LABELS.sectionAccount,
              items: accountItems,
            },
          ]}
          title={NAV_LABELS.sectionAccount}
          description={t("shell.toolsAccountDesc")}
          headingId="account-tools-title"
          compact
          pinnedHrefs={pinnedHrefSet}
          onTogglePin={(item) => {
            togglePinnedDestination(item);
            refreshPins();
          }}
        />

        <section className="shell-tools__section" aria-labelledby="tools-support">
          <h2 id="tools-support" className="shell-tools__heading">
            پشتیبانی
          </h2>
          <ul className="shell-tools__grid">
            {chrome.capabilities?.supportContactEmail ? (
              <li className="shell-tools__cell">
                <a
                  href={`mailto:${chrome.capabilities.supportContactEmail}?subject=${encodeURIComponent("بازخورد دنگ")}`}
                  className="dang-gem shell-tools__tile"
                  style={gemCssVars("slate")}
                >
                  <span className="dang-gem__icon shell-tools__tile-icon" aria-hidden>
                    <ShellIconSvg name="receipt" />
                  </span>
                  <span className="shell-tools__tile-label">گزارش مشکل</span>
                </a>
              </li>
            ) : (
              <li className="shell-tools__cell">
                <Link
                  href="/contact"
                  className="dang-gem shell-tools__tile"
                  style={gemCssVars("slate")}
                >
                  <span className="dang-gem__icon shell-tools__tile-icon" aria-hidden>
                    <ShellIconSvg name="receipt" />
                  </span>
                  <span className="shell-tools__tile-label">فرم تماس</span>
                </Link>
              </li>
            )}
          </ul>
        </section>
      </div>
    </WorkspacePageFrame>
  );
}
