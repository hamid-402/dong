"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { ShellIconSvg, type ShellIcon } from "@/components/shell/shell-icons";
import { useAppChrome } from "@/lib/use-app-chrome";
import {
  accountNav,
  isNavHrefActive,
  spaceNav,
  type NavItemV2,
} from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import { TILE_GEM_PALETTES } from "@/lib/tile-gem-palettes";
import { slugFromPathname } from "@/lib/workspace-storage";

const GEM_BY_ICON: Partial<Record<ShellIcon, string>> = {
  wallet: "teal",
  receipt: "gold",
  cart: "amber",
  box: "mint",
  partners: "coral",
  settings: "slate",
  home: "deep",
};

function gemStyle(gemKey: string): CSSProperties {
  const gem = TILE_GEM_PALETTES[gemKey] ?? TILE_GEM_PALETTES.teal!;
  return {
    "--tile-gem-edge": gem.edge,
    "--tile-gem-mid": gem.mid,
    "--tile-gem-center": gem.center,
    "--tile-gem-ink": gem.ink,
  } as CSSProperties;
}

function ToolsTile({ item }: { item: NavItemV2 }) {
  const pathname = usePathname();
  const active = isNavHrefActive(pathname, item.href);
  const gemKey = GEM_BY_ICON[item.icon] ?? "teal";

  return (
    <li className="shell-tools__cell">
      <Link
        href={item.href}
        className={`shell-tools__tile${active ? " is-active" : ""}`}
        style={gemStyle(gemKey)}
        aria-current={active ? "page" : undefined}
      >
        <span className="shell-tools__tile-icon" aria-hidden>
          <ShellIconSvg name={item.icon} />
        </span>
        <span className="shell-tools__tile-label">{item.label}</span>
      </Link>
    </li>
  );
}

/** Mosaic-style tool launcher — replaces the dense desktop sidebar list. */
export function ShellToolsView() {
  const chrome = useAppChrome();
  const pathname = usePathname();
  const active = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = slugFromPathname(pathname) ?? active?.slug ?? null;
  const sections = spaceNav(active?.template, slug, {
    approvalQueue: chrome.capabilities?.productFlags?.approvalQueue,
  });
  const accountItems = accountNav();

  return (
    <div className="shell-tools">
      <header className="shell-tools__intro">
        <h1>{NAV_LABELS.more}</h1>
        <p>ابزارهای این فضا و حساب — به‌جای منوی شلوغ کناری.</p>
      </header>

      {sections.map((section) => (
        <section key={section.key} className="shell-tools__section" aria-labelledby={`tools-${section.key}`}>
          <h2 id={`tools-${section.key}`} className="shell-tools__heading">
            {section.label}
          </h2>
          <ul className="shell-tools__grid">
            {section.items.map((item) => (
              <ToolsTile key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ))}

      <section className="shell-tools__section" aria-labelledby="tools-account">
        <h2 id="tools-account" className="shell-tools__heading">
          {NAV_LABELS.sectionAccount}
        </h2>
        <ul className="shell-tools__grid">
          <ToolsTile
            item={{
              key: "profile",
              label: NAV_LABELS.profile,
              href: "/account",
              icon: "settings",
            }}
          />
          {accountItems.map((item) => (
            <ToolsTile key={item.key} item={item} />
          ))}
          <li className="shell-tools__cell">
            <a
              href="mailto:support@dang.local?subject=بازخورد%20دنگ"
              className="shell-tools__tile"
              style={gemStyle("slate")}
            >
              <span className="shell-tools__tile-icon" aria-hidden>
                <ShellIconSvg name="receipt" />
              </span>
              <span className="shell-tools__tile-label">گزارش مشکل</span>
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
