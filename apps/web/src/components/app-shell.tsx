"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useHubEmbed } from "@/components/mosaic/hub-embed";
import { useShellV2 } from "@/components/shell/shell-v2-context";
import { ShellIconSvg, type ShellIcon } from "@/components/shell/shell-icons";
import { NotificationBell } from "@/components/notification-bell";
import { PageTrailBar } from "@/components/page-trail-bar";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { classicNavForTemplate, type HubTab } from "@/lib/workspace-modules";
import { hubPathFor } from "@/lib/hub-links";
import { NAV_LABELS } from "@/lib/nav-labels";

export type { ShellIcon };
export { ShellIconSvg };

/** Fallback when AppChrome is absent — same tree roots as mosaic RAW_MENU_ITEMS. */
const FALLBACK_NAV: HubTab[] = [
  { key: "home", path: "/hub", label: NAV_LABELS.home, icon: "home" },
  { key: "spaces", path: "/hub/spaces", label: NAV_LABELS.spacesList, icon: "home" },
  { key: "finance", path: "/hub/finance", label: NAV_LABELS.expenses, icon: "wallet" },
  { key: "buy", path: "/hub/buy", label: NAV_LABELS.sectionBuy, icon: "cart" },
  { key: "partners", path: hubPathFor("/workspaces/partnership"), label: NAV_LABELS.partners, icon: "partners" },
  { key: "manage", path: "/hub/manage", label: NAV_LABELS.account, icon: "settings" },
];

function useShellNav(): HubTab[] {
  const chrome = useOptionalAppChrome();
  if (!chrome) return FALLBACK_NAV;
  const template = chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.template;
  const links = classicNavForTemplate(template);
  return links.length > 0 ? links : FALLBACK_NAV;
}

/**
 * Classic product chrome for mounts outside Shell V2.
 * Under AppShellV2 / HubEmbed this is a transparent passthrough (no second chrome).
 */
export function AppShell({
  children,
  workspaceName,
  workspaceId,
  userName,
  persistenceLabel = "در حال بارگذاری…",
  rail,
  topBarActions,
  motionOff = false,
  notificationUnreadCount = 0,
}: {
  children: ReactNode;
  workspaceName?: string;
  workspaceId?: string;
  userName?: string;
  persistenceLabel?: string;
  rail?: ReactNode;
  topBarActions?: ReactNode;
  motionOff?: boolean;
  notificationUnreadCount?: number;
}) {
  const embedded = useHubEmbed();
  const inShellV2 = useShellV2();
  const pathname = usePathname();
  const router = useRouter();
  const nav = useShellNav();

  if (embedded || inShellV2) {
    return motionOff ? <div className="motionOff">{children}</div> : <>{children}</>;
  }

  function isActive(href: string) {
    return href === "/hub"
      ? pathname === "/hub" || pathname === "/hub/"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className={motionOff ? "productShellPage motionOff" : "productShellPage"}>
      <div className="ambient" aria-hidden="true" />
      <div className={rail ? "showcase productShowcase" : "productShowcaseSolo"}>
        <section className="appShell">
          <div className="appMain">
            <nav className="mobileNavBar" aria-label="ناوبری موبایل">
              {nav.map((item) => (
                <Link
                  className={isActive(item.path) ? "active" : ""}
                  href={item.path}
                  key={item.key}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <header className="topbar">
              <div className="workspace">
                {workspaceName || "بدون فضای کاری"} <span>⌄</span>
              </div>
              <div className="topActions">
                {topBarActions ?? (
                  <NotificationBell
                    workspaceId={workspaceId}
                    initialUnreadCount={notificationUnreadCount}
                  />
                )}
              </div>
            </header>
            <PageTrailBar />
            <div className="content">{children}</div>
          </div>
          <aside className="sidebar">
            <div className="brand">
              <span className="brandMark">
                <ShellIconSvg name="home" />
              </span>
              <span>
                <b>دنگ همکاری</b>
                <small>{persistenceLabel}</small>
              </span>
            </div>
            <nav>
              {nav.map((item) => (
                <button
                  className={isActive(item.path) ? "active" : ""}
                  key={item.key}
                  type="button"
                  onClick={() => router.push(item.path)}
                >
                  <ShellIconSvg name={item.icon} />
                  {item.label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              className="profile"
              onClick={() => router.push("/account")}
              style={{
                all: "unset",
                display: "flex",
                gap: 10,
                alignItems: "center",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <span>{(userName ?? "ک").slice(0, 1)}</span>
              <div>
                <b>{userName ?? "کاربر محلی"}</b>
                <small>{workspaceName || "بدون فضا"} · پروفایل</small>
              </div>
            </button>
          </aside>
        </section>
        {rail}
      </div>
    </div>
  );
}
