"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { WorkspaceSwitcher } from "@/components/mosaic/workspace-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { AppChromeProvider, useAppChrome } from "@/lib/use-app-chrome";
import { SessionGate } from "@/components/session-gate";
import { ShellV2Provider, useShellV2Api } from "@/components/shell/shell-v2-context";
import { AppTabbar } from "@/components/shell/app-tabbar";
import { AppBreadcrumb } from "@/components/shell/app-breadcrumb";
import { CommandPalette } from "@/components/shell/command-palette";
import { bottomTabsV2, expenseFabHref } from "@/lib/navigation-v2";
import { breadcrumbForPathname } from "@/lib/shell-breadcrumb";
import { NAV_LABELS } from "@/lib/nav-labels";
import { slugFromPathname } from "@/lib/workspace-storage";
import { useViewportMode } from "@/lib/use-viewport";

function AppShellV2Inner({ children }: { children: ReactNode }) {
  const chrome = useAppChrome();
  const shell = useShellV2Api();
  const pathname = usePathname();
  const viewport = useViewportMode();
  const active = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const template = active?.template;
  const slug = slugFromPathname(pathname) ?? active?.slug ?? null;
  const tabs = bottomTabsV2(template, slug);
  const fabHref = expenseFabHref(template, slug);
  const desktop = viewport === "desktop";
  const crumbs = useMemo(
    () => breadcrumbForPathname(pathname, active?.name),
    [pathname, active?.name],
  );

  return (
    <div className="app-viewport">
      <div className="ambient ambient--rich" aria-hidden="true" />
      <div className={`app-shell shell-v2${desktop ? " shell-v2--desktop" : ""}`}>
        <header className="shell-v2__header">
          <div className="shell-v2__brand">
            <span className="shell-v2__mark" aria-hidden>
              <ShellIconSvg name="wallet" />
            </span>
            <div className="shell-v2__brand-text">
              <b>دنگ همکاری</b>
              <WorkspaceSwitcher />
            </div>
          </div>

          {desktop ? (
            <div className="shell-v2__header-nav">
              <AppTabbar tabs={tabs} fabHref={null} variant="header" />
            </div>
          ) : null}

          <div className="shell-v2__user">
            <span
              className={`mosaic-status mosaic-status--compact${chrome.ready && !chrome.error ? " is-online" : ""}`}
              aria-live="polite"
              title={
                chrome.ready
                  ? chrome.error
                    ? "ارتباط با API برقرار نیست"
                    : chrome.persistenceLabel === "ذخیره‌سازی پایدار"
                      ? "داده‌ها روی Postgres ذخیره می‌شوند"
                      : chrome.persistenceLabel
                  : "در حال اتصال…"
              }
            >
              <i />
              <span className="visually-hidden">
                {chrome.ready ? (chrome.error ? "API قطع" : chrome.persistenceLabel) : "…"}
              </span>
            </span>
            <button
              type="button"
              className="shell-v2__search"
              onClick={() => shell?.openCommandPalette()}
              title="جستجو (Ctrl+K)"
              aria-label="باز کردن جستجو"
            >
              <span className="shell-v2__search-icon" aria-hidden>
                <ShellIconSvg name="search" />
              </span>
              <span className="shell-v2__search-label">جستجو</span>
              <kbd className="shell-v2__search-kbd">Ctrl K</kbd>
            </button>
            {desktop && fabHref ? (
              <Link href={fabHref} className="shell-v2__cta">
                {NAV_LABELS.addExpense}
              </Link>
            ) : null}
            <ThemeToggleButton />
            <NotificationBell workspaceId={chrome.workspaceId} />
            <HeaderProfileButton />
          </div>
        </header>

        <div className="shell-v2__body">
          <main id="main" className="shell-v2__main" tabIndex={-1}>
            {crumbs.length > 0 ? <AppBreadcrumb items={crumbs} /> : null}
            {children}
          </main>
        </div>

        {!desktop ? (
          <div className="shell-v2__dock">
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
          <AppShellV2Inner>{children}</AppShellV2Inner>
        </ShellV2Provider>
      </AppChromeProvider>
    </SessionGate>
  );
}
