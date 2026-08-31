"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

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

const NAV: Array<{ href: string; label: string; icon: ShellIcon }> = [
  { href: "/", label: "خانه", icon: "home" },
  { href: "/workspaces", label: "مالی", icon: "wallet" },
  { href: "/workspaces/procurement", label: "خرید", icon: "cart" },
  { href: "/workspaces/assets", label: "تجهیزات", icon: "box" },
  { href: "/workspaces/partnership", label: "شرکا", icon: "partners" },
  { href: "/onboarding", label: "مدیریت", icon: "settings" },
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

/**
 * Single product chrome for every route (including home).
 * Optional `rail` mirrors the home phone column without forking the shell.
 */
export function AppShell({
  children,
  workspaceName,
  userName,
  persistenceLabel = "دفتر عملیات مشترک",
  rail,
  topBarActions,
  motionOff = false,
  notificationCount = 0,
}: {
  children: ReactNode;
  workspaceName?: string;
  userName?: string;
  persistenceLabel?: string;
  rail?: ReactNode;
  topBarActions?: ReactNode;
  motionOff?: boolean;
  notificationCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className={motionOff ? "productShellPage motionOff" : "productShellPage"}>
      <div className="ambient" aria-hidden="true" />
      <div className={rail ? "showcase productShowcase" : "productShowcaseSolo"}>
        <section className="appShell">
          <div className="appMain">
            <nav className="mobileNavBar" aria-label="ناوبری موبایل">
              {NAV.map((item) => (
                <Link
                  className={isActive(item.href) ? "active" : ""}
                  href={item.href}
                  key={item.href}
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
                  <>
                    <button type="button" aria-label="جست‌وجو">
                      <ShellIconSvg name="search" />
                    </button>
                    <button
                      type="button"
                      aria-label="اعلان‌ها"
                      onClick={() => router.push("/workspaces")}
                    >
                      <ShellIconSvg name="bell" />
                      {notificationCount > 0 ? <span className="notifDot" aria-hidden="true" /> : null}
                    </button>
                  </>
                )}
              </div>
            </header>
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
              {NAV.map((item) => (
                <button
                  className={isActive(item.href) ? "active" : ""}
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                >
                  <ShellIconSvg name={item.icon} />
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="profile">
              <span>{(userName ?? "ک").slice(0, 1)}</span>
              <div>
                <b>{userName ?? "کاربر محلی"}</b>
                <small>{workspaceName || "بدون فضا"}</small>
              </div>
            </div>
          </aside>
        </section>
        {rail}
      </div>
    </div>
  );
}
