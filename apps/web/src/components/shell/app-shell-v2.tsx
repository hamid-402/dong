"use client";

import { useEffect, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import { ApprovalQueueBadge } from "@/components/shell/approval-queue-badge";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { AppearanceDialog } from "@/components/theme-toggle";
import { AppChromeProvider, useAppChrome } from "@/lib/use-app-chrome";
import { SessionGate } from "@/components/session-gate";
import { ShellLocationProvider, ShellV2Provider, useShellV2Api } from "@/components/shell/shell-v2-context";
import { resolveShellLocation } from "@/components/shell/shell-location";
import { AppTabbar } from "@/components/shell/app-tabbar";
import { ShellTrail } from "@/components/shell/shell-trail";
import { ShellPageTrail } from "@/components/shell/shell-page-trail";
import { ShellHeaderSearchField } from "@/components/shell/shell-header-search";
import { ShellSpaceSwitcher } from "@/components/shell/shell-space-switcher";
import { CommandPalette } from "@/components/shell/command-palette";
import { WorkspaceSectionTabs } from "@/components/shell/space-kind-header-tabs";
import { bottomTabsV2 } from "@/lib/navigation-v2";
import { canonicalHref, wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav-labels";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import { spaceKindForTemplate, type SpaceKind } from "@dang/contracts";
import { assignKindGems, shellKindStyle } from "@/lib/tile-gem-palettes";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { spaceNavFlagsFromCapabilities } from "@/lib/workspace-page-access";

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
  /** Membership leave / archive lives in settings danger zone — not home nav. */
  const leaveMembershipHref =
    inWorkspace && slug && template && template !== "personal"
      ? `${canonicalHref("settings", slug)}#danger`
      : null;
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
            inWorkspace && slug ? " shell-v2__header--workspace" : ""
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
              <ShellSpaceSwitcher leaveHref={leaveMembershipHref} />
            </div>
            <div className="shell-v2__zone shell-v2__zone--end shell-v2__user">
              <ShellHeaderSearchField />
              <NotificationBell workspaceId={chrome.workspaceId ?? undefined} />
              <HeaderProfileButton
                notice={
                  <ApprovalQueueBadge workspaceId={chrome.workspaceId ?? undefined} />
                }
              />
            </div>
          </div>
          {inWorkspace && slug ? (
            <div className="shell-v2__place shell-v2__place--line">
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
              {showCatalog ? (
                <Link href={wPath(slug, "catalog")} className="shell-v2__catalogLink">
                  {NAV_LABELS.catalog}
                </Link>
              ) : null}
              <ShellPageTrail
                items={location.trail}
                fallbackHref={wPath(slug)}
                dense
              />
            </div>
          ) : (
            <div className="shell-v2__place">
              <ShellTrail />
            </div>
          )}
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
      <AppearanceDialog />
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
