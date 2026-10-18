"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";

const TABS = [
  { href: "/account", label: "مشخصات", match: "exact" as const },
  { href: "/account/security", label: "امنیت", match: "prefix" as const },
  { href: "/account/appearance", label: "ظاهر", match: "prefix" as const },
  { href: "/account/friends", label: "دوستان", match: "prefix" as const },
  { href: "/me/finance", label: NAV_LABELS.personalFinance, match: "prefix" as const },
  { href: "/whats-new", label: NAV_LABELS.whatsNew, match: "prefix" as const },
];

export function AccountSectionNav() {
  const pathname = usePathname();
  const chrome = useAppChrome();
  const platformConsole =
    chrome.capabilities?.providers?.platformAdmin === "platform_v1" &&
    (chrome.platformRole === "platform_owner" ||
      chrome.platformRole === "platform_support");

  return (
    <div className="accountNav">
      <div className="dang-tabs dang-tabs" role="tablist" aria-label="حساب من">
        {TABS.map((tab) => {
          const selected =
            tab.match === "exact"
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              className="dang-tab dang-tab"
              aria-selected={selected}
            >
              {tab.label}
            </Link>
          );
        })}
        {platformConsole ? (
          <Link
            href="/admin"
            role="tab"
            className="dang-tab dang-tab"
            aria-selected={
              pathname === "/admin" || pathname.startsWith("/admin/")
            }
          >
            {NAV_LABELS.admin}
          </Link>
        ) : null}
      </div>
      <Link className="accountNav__privacy" href="/account/privacy">
        حریم خصوصی
      </Link>
    </div>
  );
}
