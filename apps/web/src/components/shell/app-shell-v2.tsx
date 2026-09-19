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
import { ShellV2Provider, useShellV2Api } from "@/components/shell/shell-v2-context";
import { AppTabbar } from "@/components/shell/app-tabbar";
import { SpaceKindHeaderTabs } from "@/components/shell/space-kind-header-tabs";
import { ShellPageTrail } from "@/components/shell/shell-page-trail";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellSecondaryRail } from "@/components/shell/shell-secondary-rail";
import { bottomTabsV2, expenseFabHref } from "@/lib/navigation-v2";
import {
  breadcrumbForPathname,
  isShellPrimaryPath,
} from "@/lib/shell-breadcrumb";
import { wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";
import { NAV_LABELS } from "@/lib/nav-labels";

function ShellUtilityCluster({
  workspaceId,
  dense = false,
}: {
  workspaceId?: string;
  /** Hide secondary tools on narrow shell. */
  dense?: boolean;
}) {
  const shell = useShellV2Api();
  const paletteOpen = shell?.commandPaletteOpen ?? false;
  return (
    <div className={`shell-v2__user${dense ? " shell-v2__user--dense" : ""}`}>
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
      {dense ? null : <ThemeToggleButton />}
      <ApprovalQueueBadge workspaceId={workspaceId} />
      <NotificationBell workspaceId={workspaceId} />
      <HeaderProfileButton />
    </div>
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
      <Link href="/home" className="shell-v2__wordmark">
        دنگ
      </Link>
      {workspaceName && workspaceHref ? (
        <Link href={workspaceHref} className="shell-v2__contextLink" title={workspaceName}>
          {workspaceName}
        </Link>
      ) : (
        <Link href="/spaces" className="shell-v2__contextLink shell-v2__contextLink--muted">
          {NAV_LABELS.spacesList}
        </Link>
      )}
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
  const tabs = bottomTabsV2(template, slug);
  const fabHref = expenseFabHref(template, slug);
  const desktop = viewport === "desktop";
  const tablet = viewport === "tablet";
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const primary = isShellPrimaryPath(pathname, search);
  const crumbs = useMemo(
    () => breadcrumbForPathname(pathname, active?.name, search),
    [pathname, active?.name, search],
  );
  const inWorkspace = Boolean(slug) && /^\/w\//.test(pathname);
  const contextName = inWorkspace ? active?.name?.trim() || null : null;
  const contextHref = inWorkspace && slug ? wPath(slug) : null;
  const railFlags = chrome.capabilities?.productFlags
    ? {
        addonAck: chrome.capabilities.productFlags.addonAck,
        approvalQueue: chrome.capabilities.productFlags.approvalQueue,
        catalogV1: chrome.capabilities.providers?.catalog === "catalog_v1",
        costCenter: chrome.capabilities.productFlags.costCenter,
        allowance: chrome.capabilities.productFlags.allowance,
        statementsV1:
          chrome.capabilities.providers?.statements === "csv_json_print_v1",
        chartsV1: chrome.capabilities.providers?.charts === "charts_v1",
      }
    : undefined;

  const tabHrefs = tabs.map((tab) => tab.href).join("|");
  useEffect(() => {
    for (const tab of tabs) router.prefetch(tab.href);
    if (fabHref) router.prefetch(fabHref);
    if (slug) router.prefetch(wPath(slug, "more"));
  }, [tabHrefs, fabHref, slug, router]);

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
    <div className="app-viewport">
      <div className="ambient ambient--rich" aria-hidden="true" />
      <div
        className={`app-shell shell-v2${desktop ? " shell-v2--desktop" : ""}${tablet ? " shell-v2--tablet" : ""}`}
      >
        {primary ? (
          <header className="shell-v2__header shell-v2__header--spaceFirst">
            <div className="shell-v2__brand">
              <Link href="/home" className="shell-v2__mark" aria-label="خانه">
                <ShellIconSvg name="wallet" />
              </Link>
              <BrandWordmark
                workspaceName={contextName}
                workspaceHref={contextHref}
              />
            </div>

            {desktop ? (
              <div className="shell-v2__header-nav">
                <SpaceKindHeaderTabs
                  workspaces={chrome.workspaces}
                  activeWorkspaceId={chrome.workspaceId}
                  homeHref="/home"
                />
              </div>
            ) : (
              <div className="shell-v2__header-nav shell-v2__header-nav--mobileKinds">
                <SpaceKindHeaderTabs
                  workspaces={chrome.workspaces}
                  activeWorkspaceId={chrome.workspaceId}
                  homeHref="/home"
                />
              </div>
            )}

            <ShellUtilityCluster
              workspaceId={chrome.workspaceId ?? undefined}
              dense={!desktop}
            />
          </header>
        ) : (
          <header className="shell-v2__header shell-v2__header--sub">
            <div className="shell-v2__sub-trail">
              <ShellPageTrail
                items={
                  crumbs.length > 0
                    ? crumbs
                    : [
                        {
                          label: active?.name?.trim() || slug || t("nav.back"),
                          href: slug ? wPath(slug) : "/home",
                        },
                        { label: t("nav.pageTrail") },
                      ]
                }
                fallbackHref={slug ? wPath(slug) : "/home"}
              />
            </div>
            <div className="shell-v2__sub-end">
              <Link href="/spaces" className="shell-v2__spacesTextLink">
                {NAV_LABELS.spacesList}
              </Link>
              <ShellUtilityCluster
                workspaceId={chrome.workspaceId ?? undefined}
                dense={!desktop}
              />
            </div>
          </header>
        )}

        <div className="shell-v2__body">
          {desktop && inWorkspace && slug ? (
            <ShellSecondaryRail
              template={template}
              slug={slug}
              flags={railFlags}
            />
          ) : null}
          <main id="main" className="shell-v2__main" tabIndex={-1}>
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

        {!desktop ? (
          <div className={`shell-v2__dock${tablet ? " shell-v2__dock--tablet" : ""}`}>
            <AppTabbar tabs={tabs} fabHref={fabHref} variant="dock" />
          </div>
        ) : null}
      </div>
      <CommandPalette />
    </div>
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
