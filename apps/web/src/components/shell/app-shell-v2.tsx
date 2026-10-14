"use client";

import { useEffect, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { NotificationBell } from "@/components/notification-bell";
import { ApprovalQueueBadge } from "@/components/shell/approval-queue-badge";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { AppChromeProvider, useAppChrome } from "@/lib/use-app-chrome";
import { SessionGate } from "@/components/session-gate";
import { ShellLocationProvider, ShellV2Provider, useShellV2Api } from "@/components/shell/shell-v2-context";
import { resolveShellLocation } from "@/components/shell/shell-location";
import { AppTabbar } from "@/components/shell/app-tabbar";
import { ShellTrail } from "@/components/shell/shell-trail";
import { ShellPageTrail } from "@/components/shell/shell-page-trail";
import { ShellHeaderSearchField } from "@/components/shell/shell-header-search";
import { WorkspaceSwitcher } from "@/components/mosaic/workspace-switcher";
import { CommandPalette } from "@/components/shell/command-palette";
import { KindHeaderSwitcher, WorkspaceSectionTabs } from "@/components/shell/space-kind-header-tabs";
import { bottomTabsV2 } from "@/lib/navigation-v2";
import { canonicalHref, spacesListHref, wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav-labels";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import { spaceKindForTemplate, type SpaceKind } from "@dang/contracts";
import { assignKindGems, shellKindStyle } from "@/lib/tile-gem-palettes";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { spaceNavFlagsFromCapabilities } from "@/lib/workspace-page-access";

/** Extra destinations that used to live in the header overflow. */
export function headerToolLinks(slug: string | null): { href: string; label: string }[] {
  return [
    { href: canonicalHref("space", slug), label: "سازمان‌ها" },
    { href: spacesListHref("building"), label: "ساختمان‌ها" },
    { href: "/spaces/reports?kind=building", label: "گزارش ساختمان" },
    { href: canonicalHref("procurement", slug), label: "تدارکات" },
    { href: canonicalHref("assets", slug), label: "تجهیزات" },
    { href: canonicalHref("proposals", slug), label: "پیشنهادها" },
    { href: canonicalHref("partners", slug), label: "شرکا" },
  ];
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
  const location = resolveShellLocation({
    pathname,
    search,
    workspaceName: displayWsName,
    template,
  });
  const primary = location.primary;
  const spacesList =
    inWorkspace && template
      ? spacesListHref(spaceKindForTemplate(template))
      : spacesListHref();
  /** Membership leave / archive lives in settings danger zone — not home nav. */
  const leaveMembershipHref =
    inWorkspace && slug && template && template !== "personal"
      ? `${canonicalHref("settings", slug)}#danger`
      : spacesList;
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
        <header
          className={`shell-v2__header${
            inWorkspace && slug
              ? " shell-v2__header--workspace"
              : primary
                ? " shell-v2__header--spaceFirst"
                : " shell-v2__header--sub"
          }`}
        >
          <div className="shell-v2__bar">
            <div className="shell-v2__zone shell-v2__zone--start">
              <Link
                href={canonicalHref("home")}
                className="shell-v2__wordmark"
                aria-label={t("shell.homeMarkAria")}
              >
                دنگ
              </Link>
              <KindHeaderSwitcher
                activeKind={location.spaceKind}
                workspaces={chrome.workspaces}
              />
              <WorkspaceSwitcher
                compact={!desktop}
                leaveHref={inWorkspace ? leaveMembershipHref : null}
              />
            </div>
            <div className="shell-v2__zone shell-v2__zone--center">
              <ShellHeaderSearchField variant="field" />
            </div>
            <div className="shell-v2__zone shell-v2__zone--end shell-v2__user">
              <ApprovalQueueBadge workspaceId={chrome.workspaceId ?? undefined} />
              <NotificationBell workspaceId={chrome.workspaceId ?? undefined} />
              <HeaderProfileButton tools={headerToolLinks(slug)} />
            </div>
          </div>
          {inWorkspace || primary || location.trail.length > 0 ? (
            <div
              className={`shell-v2__place${inWorkspace && slug ? " shell-v2__place--line" : ""}`}
            >
              {inWorkspace && slug ? (
                <WorkspaceSectionTabs
                  template={template}
                  slug={slug}
                  flags={railFlags}
                  role={membershipRole || null}
                  pathname={pathname}
                  folder={searchParams?.get("folder") ?? null}
                  activeDomain={location.activeDomain}
                  isHrefActive={location.isHrefActive}
                />
              ) : null}
              {!inWorkspace && primary ? (
                <Link href={canonicalHref("home")} className="shell-v2__mark" aria-label={t("shell.homeMarkAria")}>
                  <ShellIconSvg name="wallet" />
                </Link>
              ) : null}
              {showCatalog && slug ? (
                <Link href={wPath(slug, "catalog")} className="shell-v2__catalogLink">
                  {NAV_LABELS.catalog}
                </Link>
              ) : null}
              {primary && !inWorkspace ? (
                <div className="shell-v2__header-nav">
                  <Link
                    href={spacesListHref()}
                    className={`shell-v2__spacesTextLink${location.section === "spaces" ? " is-active" : ""}`}
                    aria-current={location.section === "spaces" ? "page" : undefined}
                  >
                    فضاها
                  </Link>
                </div>
              ) : null}
              {inWorkspace ? (
                <ShellPageTrail
                  items={location.trail}
                  fallbackHref={slug ? wPath(slug) : "/home"}
                  dense
                />
              ) : (
                <ShellTrail />
              )}
            </div>
          ) : null}
        </header>

        <div className="shell-v2__body">
          {inWorkspace && archived && slug ? (
            <div className="shell-archived-banner" role="status">
              <span>{t("shell.archivedBanner")}</span>
              <Link href={`${canonicalHref("settings", slug)}#danger`}>
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
