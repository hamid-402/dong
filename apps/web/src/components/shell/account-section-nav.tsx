"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/account", label: "مشخصات", match: "exact" as const },
  { href: "/account/security", label: "امنیت", match: "prefix" as const },
  { href: "/account/appearance", label: "ظاهر", match: "prefix" as const },
  { href: "/account/friends", label: "دوستان", match: "prefix" as const },
];

export function AccountSectionNav() {
  const pathname = usePathname();
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
      </div>
      <Link className="accountNav__privacy" href="/account/privacy">
        حریم خصوصی
      </Link>
    </div>
  );
}
