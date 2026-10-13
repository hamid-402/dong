"use client";

import { useEffect, useMemo, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { NotificationBell } from "@/components/notification-bell";
import { ApprovalQueueBadge } from "@/components/shell/approval-queue-badge";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { AppChromeProvider, useAppChrome } from "@/lib/use-app-chrome";
import { SessionGate } from "@/components/session-gate";
import { ShellLocationProvider, ShellV2Provider, useShellV2Api } from "@/components/shell/shell-v2-context";
import { resolveShellLocation } from "@/components/shell/shell-location";
import { AppTabbar } from "@/components/shell/app-tabbar";
import { ShellTrail } from "@/components/shell/shell-trail";
import { ShellHeaderSearchField } from "@/components/shell/shell-header-search";
import { WorkspaceSwitcher } from "@/components/mosaic/workspace-switcher";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellWorkspaceNavMenu } from "@/components/shell/shell-secondary-rail";
import { DirIcon } from "@/components/dir-icon";
import { bottomTabsV2 } from "@/lib/navigation-v2";
import { wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import { spaceKindForTemplate, type SpaceKind } from "@dang/contracts";
import { assignKindGems, shellKindStyle } from "@/lib/tile-gem-palettes";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { spaceNavFlagsFromCapabilities } from "@/lib/workspace-page-access";

function ShellUtilityCluster({
  workspaceId,
  slug,
  dense = false,
  hideSearch = false,
}: {
  workspaceId?: string;
  slug?: string | null;
  /** Hide secondary tools on narrow shell. */
  dense?: boolean;
  /** Search lives in the sub-header center — avoid duplicate control. */
  hideSearch?: boolean;
}) {
  const shell = useShellV2Api();
  const paletteOpen = shell?.commandPaletteOpen ?? false;
  return (
    <div className={`shell-v2__user${dense ? " shell-v2__user--dense" : ""}`}>
      {hideSearch ? null : (
        <button
          type="button"
          className="shell-v2__search shell-v2__search--icon"
          onClick={() => shell?.openCommandPalette()}
          title={t("shell.searchTitle")}
          aria-label={t("shell.searchOpen")}
          aria-haspopup="dialog"
          aria-expanded={paletteOpen}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <span className="shell-v2__search-icon" aria-hidden>
            <ShellIconSvg name="search" />
          </span>
        </button>
      )}
      {dense ? null : <ThemeToggleButton />}
      <ApprovalQueueBadge workspaceId={workspaceId} />
      <NotificationBell workspaceId={workspaceId} />
      <HeaderProfileButton />
      <details className="shellOverflow">
        <summary>ابزارهای دیگر</summary>
        <div className="shellOverflow__menu">
          <Link href="/orgs">سازمان‌ها</Link>
          <Link href="/spaces?kind=building">ساختمان‌ها</Link>
          <Link href="/spaces/reports?kind=building">گزارش ساختمان</Link>
          <Link href={slug ? wPath(slug, "procurement") : "/workspaces/procurement"}>تدارکات</Link>
          <Link href={slug ? wPath(slug, "assets") : "/workspaces/assets"}>تجهیزات</Link>
          <Link href={slug ? wPath(slug, "proposals") : "/proposals"}>پیشنهادها</Link>
          <Link href={slug ? wPath(slug, "partners") : "/workspaces/partnership"}>شرکا</Link>
        </div>
      </details>
    </div>
  );
}

function LeaveSpaceControl({
  href,
  compact = false,
}: {
  href: string;
  /** Icon-only on narrow sub-header. */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`shell-v2__leaveSpace${compact ? " shell-v2__leaveSpace--compact" : ""}`}
      aria-label={t("shell.leaveSpaceAria")}
      title={t("shell.leaveSpace")}
    >
      <span className="shell-v2__leaveSpaceIcon" aria-hidden>
        <DirIcon>→</DirIcon>
      </span>
      {compact ? null : (
        <span className="shell-v2__leaveSpaceLabel">{t("shell.leaveSpace")}</span>
      )}
    </Link>
  );
}

function BrandWordmark({
  workspaceName,
  workspaceHref,
}: {
  workspaceName?: string | null;
  workspaceHref?: string | null;
}) {
  return (
    <div className="shell-v2__brand-text">
      <Link
        href="/home"
        className="shell-v2__wordmark"
        aria-label={t("shell.homeMarkAria")}
      >
        دنگ
      </Link>
      {workspaceName && workspaceHref ? (
        <Link href={workspaceHref} className="shell-v2__contextLink" title={workspaceName}>
          {workspaceName}
        </Link>
      ) : null}
    </div>
  );
}

function AppShellV2Inner({ children }: { children: ReactNode }) {
  const chrome = useAppChrome();
  const shellApi = useShellV2Api();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewport = useViewportMode();
  const active = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const template = active?.template;
  const slug = slugFromPathname(pathname) ?? active?.slug ?? null;
  const inWorkspace = Boolean(slug) && /^\/w\//.test(pathname);
  const { role: membershipRole } = useWorkspaceMembershipRole(
    inWorkspace ? chrome.workspaceId : "",
  );
  const tabs = bottomTabsV2(template, slug);
  const fabHref = null;
  const desktop = viewport === "desktop";
  const tablet = viewport === "tablet";
  const search = searchParams?.toString() ?? "";
  const displayWsName = workspaceDisplayName(active?.name, template);
  const location = useMemo(
    () =>
      resolveShellLocation({
        pathname,
        search,
        workspaceName: displayWsName,
        template,
      }),
    [pathname, search, displayWsName, template],
  );
  const primary = location.primary;
  const spacesListHref =
    inWorkspace && template
      ? `/spaces?kind=${spaceKindForTemplate(template)}`
      : "/spaces";
  /** Membership leave / archive lives in settings danger zone — not home nav. */
  const leaveMembershipHref =
    inWorkspace && slug && template && template !== "personal"
      ? `${wPath(slug, "settings")}#danger`
      : spacesListHref;
  const archived = Boolean(active?.archivedAt);
  const railFlags = spaceNavFlagsFromCapabilities(chrome.capabilities);
  const tabHrefs = tabs.map((tab) => tab.href).join("|");
  useEffect(() => {
    for (const tab of tabs) router.prefetch(tab.href);
    if (fabHref) router.prefetch(fabHref);
    if (slug) router.prefetch(wPath(slug, "more"));
  }, [tabHrefs, fabHref, slug, router]);

  const realmKind: SpaceKind | null = location.spaceKind;
  const realmStyle = (() => {
    if (!inWorkspace || !active || !realmKind) return undefined;
    const ids = chrome.workspaces
      .filter((ws) => spaceKindForTemplate(ws.template) === realmKind)
      .map((ws) => ws.id);
    return shellKindStyle(assignKindGems(realmKind, ids).get(active.id));
  })();
  const domainTrigger = location.trail.find((crumb) => crumb.group)?.label ?? "منو";
  const showCatalog =
    Boolean(railFlags.catalogV1) && realmKind != null && realmKind !== "personal";

  const statementPrint =
    typeof pathname === "string" && /\/statements\/[^/]+\/print\/?$/.test(pathname);

  if (statementPrint) {
    return (
      <div className="app-viewport app-viewport--statement-print">
        <main id="main" className="shell-v2__main shell-v2__main--print" tabIndex={-1}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <ShellLocationProvider value={location}>
    <div className="app-viewport">
      <div className="ambient ambient--rich" aria-hidden="true" />
      <div
        className={`app-shell shell-v2${desktop ? " shell-v2--desktop" : ""}${tablet ? " shell-v2--tablet" : ""}`}
        data-kind={realmKind ?? undefined}
        style={realmStyle}
      >
        {inWorkspace && slug ? (
          <header className="shell-v2__header shell-v2__header--workspace">
            <div className="shell-v2__identity">
              <ShellWorkspaceNavMenu
                template={template}
                slug={slug}
                flags={railFlags}
                role={membershipRole || null}
                triggerLabel={domainTrigger}
                leaveHref={template && template !== "personal" ? leaveMembershipHref : null}
                activeDomain={location.activeDomain}
              />
              <Link href="/home" className="shell-v2__mark" aria-label={t("shell.homeMarkAria")}>
                <ShellIconSvg name="wallet" />
              </Link>
              {realmKind ? (
                <Link
                  href={`/spaces?kind=${realmKind}`}
                  className="shell-v2__kindChip"
                  data-kind={realmKind}
                >
                  {spaceTabLabel(realmKind)}
                </Link>
              ) : null}
              <BrandWordmark />
              <WorkspaceSwitcher compact={!desktop} />
              {showCatalog ? (
                <Link href={wPath(slug, "catalog")} className="shell-v2__catalogLink">
                  {NAV_LABELS.catalog}
                </Link>
              ) : null}
              <div className="shell-v2__identity-end">
                <ShellHeaderSearchField variant={desktop ? "field" : "icon"} />
                <ShellUtilityCluster
                  workspaceId={chrome.workspaceId ?? undefined}
                  slug={slug}
                  dense={!desktop}
                  hideSearch
                />
              </div>
            </div>
            <div className="shell-v2__place">
              <ShellTrail />
            </div>
          </header>
        ) : primary ? (
          <header className="shell-v2__header shell-v2__header--spaceFirst">
            <div className="shell-v2__brand">
              {inWorkspace && slug ? (
                <ShellWorkspaceNavMenu
                  template={template}
                  slug={slug}
                  flags={railFlags}
                  role={membershipRole || null}
                />
              ) : null}
              {inWorkspace ? (
                <LeaveSpaceControl href={leaveMembershipHref} />
              ) : (
                <Link href="/home" className="shell-v2__mark" aria-label={t("shell.homeMarkAria")}>
                  <ShellIconSvg name="wallet" />
                </Link>
              )}
              <BrandWordmark />
              <WorkspaceSwitcher compact={!desktop} />
            </div>

            <div className="shell-v2__header-nav">
              <Link
                href="/spaces"
                className={`shell-v2__spacesTextLink${location.section === "spaces" ? " is-active" : ""}`}
                aria-current={location.section === "spaces" ? "page" : undefined}
              >
                فضاها
              </Link>
            </div>

            <div className="shell-v2__header-end">
              {inWorkspace && desktop ? (
                <Link
                  href={spacesListHref}
                  className="shell-v2__spacesTextLink"
                  aria-label={t("shell.spacesListLinkAria")}
                >
                  {NAV_LABELS.home}
                </Link>
              ) : null}
              <ShellUtilityCluster
                workspaceId={chrome.workspaceId ?? undefined}
                slug={slug}
                dense={!desktop}
              />
            </div>
          </header>
        ) : (
          <header className="shell-v2__header shell-v2__header--sub">
            <div className="shell-v2__sub-start">
              {inWorkspace && slug ? (
                <ShellWorkspaceNavMenu
                  template={template}
                  slug={slug}
                  flags={railFlags}
                  role={membershipRole || null}
                />
              ) : null}
              {inWorkspace ? (
                <LeaveSpaceControl href={leaveMembershipHref} compact />
              ) : null}
              <WorkspaceSwitcher compact />
              <ShellTrail />
            </div>
            <div className="shell-v2__sub-center">
              <ShellHeaderSearchField
                variant={viewport === "mobile" ? "icon" : "field"}
              />
            </div>
            <div className="shell-v2__sub-end">
              {inWorkspace ? (
                <Link
                  href={spacesListHref}
                  className="shell-v2__spacesTextLink"
                  aria-label={t("shell.spacesListLinkAria")}
                >
                  {NAV_LABELS.home}
                </Link>
              ) : null}
              <ShellUtilityCluster
                workspaceId={chrome.workspaceId ?? undefined}
                slug={slug}
                dense={!desktop}
                hideSearch
              />
            </div>
          </header>
        )}

        <div className="shell-v2__body">
          {inWorkspace && archived && slug ? (
            <div className="shell-archived-banner" role="status">
              <span>{t("shell.archivedBanner")}</span>
              <Link href={`${wPath(slug, "settings")}#danger`}>
                {t("shell.archivedBannerAction")}
              </Link>
            </div>
          ) : null}
          <main id="main" className="shell-v2__main" tabIndex={-1}>
            {chrome.error ||
            chrome.capabilitiesUnavailable ||
            chrome.notificationsError ? (
              <div className="shell-chrome-banner" role="status">
                <span>
                  {chrome.error ??
                    chrome.notificationsError ??
                    "capabilities در دسترس نیست — برخی برچسب‌های اعتماد ممکن است ناقص باشند."}
                </span>
                <button
                  type="button"
                  className="textButton"
                  onClick={() => chrome.refreshChrome()}
                >
                  تلاش دوباره
                </button>
              </div>
            ) : null}
            {chrome.capabilities?.providers?.offlineSync === "mutation_queue_v1" &&
            chrome.offlineQueueCount > 0 ? (
              <div className="shell-offline-banner" role="status">
                <span>
                  {t("offline.bannerTitle", { count: chrome.offlineQueueCount })}
                </span>
                <div className="shell-offline-banner__actions">
                  <button
                    type="button"
                    className="textButton"
                    onClick={() => {
                      void chrome.flushOfflineQueue();
                    }}
                  >
                    {t("offline.bannerRetry")}
                  </button>
                  <button
                    type="button"
                    className="textButton"
                    onClick={() => shellApi?.setNotificationsOpen(true)}
                  >
                    {t("offline.bannerOpen")}
                  </button>
                </div>
              </div>
            ) : null}
            {children}
          </main>
        </div>

        <div
          className={`shell-v2__dock${tablet ? " shell-v2__dock--tablet" : ""}${desktop ? " shell-v2__dock--desktop" : ""}`}
        >
          <AppTabbar tabs={tabs} fabHref={fabHref} variant="dock" />
        </div>
      </div>
      <CommandPalette />
    </div>
    </ShellLocationProvider>
  );
}

/** Unified product chrome — SessionGate + AppChrome + ShellV2 landmarks. */
export function AppShellV2({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppChromeProvider>
        <ShellV2Provider>
          <Suspense fallback={<main id="main" className="shell-v2__main" tabIndex={-1}>{children}</main>}>
            <AppShellV2Inner>{children}</AppShellV2Inner>
          </Suspense>
        </ShellV2Provider>
      </AppChromeProvider>
    </SessionGate>
  );
}
