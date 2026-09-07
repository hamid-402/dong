"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useHubEmbed } from "@/components/mosaic/hub-embed";
import { useShellV2 } from "@/components/shell/shell-v2-context";
import { NotificationBell } from "@/components/notification-bell";
import { PageTrailBar } from "@/components/page-trail-bar";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { classicNavForTemplate, type HubTab } from "@/lib/workspace-modules";
import { hubPathFor } from "@/lib/hub-links";
import { NAV_LABELS } from "@/lib/nav-labels";

export type ShellIcon =
  | "home"
  | "wallet"
  | "cart"
  | "box"
  | "partners"
  | "settings"
  | "search"
  | "bell"
  | "receipt";

/** Fallback when AppChrome is absent — same tree roots as mosaic RAW_MENU_ITEMS. */
const FALLBACK_NAV: HubTab[] = [
  { key: "home", path: "/hub", label: NAV_LABELS.home, icon: "home" },
  { key: "spaces", path: "/hub/spaces", label: NAV_LABELS.spacesList, icon: "home" },
  { key: "finance", path: "/hub/finance", label: NAV_LABELS.expenses, icon: "wallet" },
  { key: "buy", path: "/hub/buy", label: NAV_LABELS.sectionBuy, icon: "cart" },
  { key: "partners", path: hubPathFor("/workspaces/partnership"), label: NAV_LABELS.partners, icon: "partners" },
  { key: "manage", path: "/hub/manage", label: NAV_LABELS.account, icon: "settings" },
];

export function ShellIconSvg({ name }: { name: ShellIcon }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M16 11h5" />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
          <path d="M3 4h2l2.5 11h10l3-8H7" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M4 7h16v13H4z" />
          <path d="m8 7 1-3h6l1 3M9 12h6" />
        </svg>
      );
    case "partners":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
          <path d="M15 20v-1a5 5 0 0 1 6 0v1" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common}>
          <path d="M7 3h10l2 4v14H5V7l2-4Z" />
          <path d="M9 11h6M9 15h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </svg>
      );
  }
}

function useShellNav(): HubTab[] {
  const chrome = useOptionalAppChrome();
  if (!chrome) return FALLBACK_NAV;
  const template = chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.template;
  const links = classicNavForTemplate(template);
  return links.length > 0 ? links : FALLBACK_NAV;
}

/**
 * Classic product chrome (non-hub mounts). Menu matches mosaic `buildNavForTemplate`.
 * Inside hub embed this shell is a passthrough.
 */
export function AppShell({
  children,
  workspaceName,
  workspaceId,
  userName,
  persistenceLabel = "دفتر عملیات مشترک",
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
  /** Used when AppChromeProvider is absent (e.g. overview). */
  notificationUnreadCount?: number;
}) {
  const embedded = useHubEmbed();
  const inShellV2 = useShellV2();
  const pathname = usePathname();
  const router = useRouter();
  const nav = useShellNav();

  /* Inside hub embed or unified Shell V2 — no second chrome. */
  if (embedded || inShellV2) {
    return <div className={motionOff ? "hub-embed motionOff" : "hub-embed"}>{children}</div>;
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
              onClick={() => router.push("/profile")}
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
