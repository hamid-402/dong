"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShellIconSvg } from "@/components/app-shell";
import { isNavHrefActive, type BottomTabV2 } from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import { t } from "@/lib/i18n";

export function AppTabbar({
  tabs,
  fabHref,
  variant,
}: {
  tabs: BottomTabV2[];
  fabHref: string | null;
  variant: "dock" | "header";
}) {
  const pathname = usePathname();
  const activeIndex = tabs.findIndex((tab) => isNavHrefActive(pathname, tab.href));

  if (variant === "header") {
    return (
      <nav className="shell-tabs shell-tabs--header" aria-label={t("shell.navMain")}>
        {tabs.map((tab, index) => {
          const active = index === activeIndex;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`shell-tabs__tab${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="shell-tabs__icon" aria-hidden>
                <ShellIconSvg name={tab.icon} />
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  const left = tabs.slice(0, Math.ceil(tabs.length / 2));
  const right = tabs.slice(Math.ceil(tabs.length / 2));
  const slotCount = left.length + right.length + (fabHref ? 1 : 0);

  return (
    <nav
      className="shell-tabs shell-tabs--dock"
      aria-label={t("shell.navBottom")}
      style={{ ["--tab-count" as string]: String(Math.max(slotCount, 1)) }}
    >
      {left.map((tab) => {
        const active = isNavHrefActive(pathname, tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`shell-tabs__tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="shell-tabs__icon" aria-hidden>
              <ShellIconSvg name={tab.icon} />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}

      {fabHref ? (
        <div className="shell-tabs__fab-slot">
          <Link href={fabHref} className="shell-fab" aria-label={NAV_LABELS.addExpense}>
            <span className="shell-fab__plus" aria-hidden>
              ＋
            </span>
            <span className="shell-fab__label">{NAV_LABELS.addExpense}</span>
          </Link>
        </div>
      ) : null}

      {right.map((tab) => {
        const active = isNavHrefActive(pathname, tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`shell-tabs__tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="shell-tabs__icon" aria-hidden>
              <ShellIconSvg name={tab.icon} />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
