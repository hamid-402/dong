"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShellIconSvg } from "@/components/app-shell";
import { WorkspaceSwitcher } from "@/components/mosaic/workspace-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { AppChromeProvider, useAppChrome } from "@/lib/use-app-chrome";
import { bottomTabsForTemplate } from "@/lib/workspace-modules";
import { useViewportMode } from "@/lib/use-viewport";
import { SessionGate } from "@/components/session-gate";

function HubTabs({ variant }: { variant: "dock" | "header" }) {
  const pathname = usePathname();
  const chrome = useAppChrome();
  const template = chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.template;
  const tabs = bottomTabsForTemplate(template);
  const activeTabIndex = tabs.findIndex((tab) =>
    tab.path === "/hub"
      ? pathname === "/hub" || pathname === "/hub/"
      : pathname === tab.path || pathname.startsWith(`${tab.path}/`),
  );

  return (
    <nav
      className={`mosaic-tabs mosaic-tabs--${variant}`}
      aria-label="میانبرها"
      style={{ ["--tab-count" as string]: String(Math.max(tabs.length, 1)) }}
    >
      {variant === "dock" ? (
        <span
          className="mosaic-tabs__glider"
          style={{
            transform: `translateX(${(activeTabIndex >= 0 ? activeTabIndex : 0) * -100}%)`,
            opacity: activeTabIndex >= 0 ? 1 : 0,
          }}
        />
      ) : null}
      {tabs.map((tab, index) => {
        const active = index === activeTabIndex;
        return (
          <Link
            key={tab.key}
            href={tab.path}
            className={`mosaic-tabs__tab${active ? " mosaic-tabs__tab--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="mosaic-tabs__icon">
              <ShellIconSvg name={tab.icon} />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MosaicLayoutInner({ children }: { children: ReactNode }) {
  const chrome = useAppChrome();
  const pathname = usePathname();
  const viewport = useViewportMode();
  const inContent = pathname.includes("/~");
  const tabsInHeader = viewport === "desktop";

  return (
    <div className="app-viewport">
      <div className="ambient ambient--rich" aria-hidden="true" />
      <div className={`app-shell mosaic-layout mosaic-layout--pro${inContent ? " is-content" : ""}`}>
        <header className="mosaic-layout__header mosaic-layout__header--lean">
          <div className="mosaic-layout__brand">
            <span className="mosaic-layout__mark" aria-hidden>
              <ShellIconSvg name="wallet" />
            </span>
            <div className="mosaic-layout__brand-text">
              <b>دنگ همکاری</b>
              <WorkspaceSwitcher />
            </div>
          </div>

          {tabsInHeader ? (
            <div className="mosaic-layout__header-nav">
              <HubTabs variant="header" />
            </div>
          ) : null}

          <div className="mosaic-layout__user">
            <span className={`mosaic-status${chrome.ready && !chrome.error ? " is-online" : ""}`}>
              <i />
              {chrome.ready ? (chrome.error ? "API قطع" : chrome.persistenceLabel) : "…"}
            </span>
            <ThemeToggleButton />
            <NotificationBell workspaceId={chrome.workspaceId} />
            <HeaderProfileButton />
          </div>
        </header>

        <main className={`mosaic-layout__content${inContent ? " is-full" : ""}`}>{children}</main>

        {!tabsInHeader ? (
          <div className="mosaic-layout__dock">
            <HubTabs variant="dock" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MosaicLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppChromeProvider>
        <MosaicLayoutInner>{children}</MosaicLayoutInner>
      </AppChromeProvider>
    </SessionGate>
  );
}
