"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MembershipRole, WorkspaceTemplate } from "@dang/contracts";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { isNavHrefActive, spaceNav, type SpaceNavFlags } from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

/** Compact secondary rail for desktop — real spaceNav links only (no fake tiles). */
export function ShellSecondaryRail({
  template,
  slug,
  flags,
  role,
}: {
  template: WorkspaceTemplate | undefined;
  slug: string;
  flags?: SpaceNavFlags;
  role?: MembershipRole | null;
}) {
  const pathname = usePathname();
  const sections = spaceNav(template, slug, flags, role);
  const items = sections
    .flatMap((section) => section.items)
    .filter((item) => Boolean(item.href))
    .slice(0, 10);

  return (
    <aside className="shell-v2__rail" aria-label="میانبر فضای کاری">
      <Link
        href={wPath(slug)}
        className={`shell-v2__rail-link${isNavHrefActive(pathname, wPath(slug)) ? " is-active" : ""}`}
      >
        <ShellIconSvg name="home" />
        <span>{NAV_LABELS.space}</span>
      </Link>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`shell-v2__rail-link${isNavHrefActive(pathname, item.href) ? " is-active" : ""}`}
          title={item.label}
        >
          <ShellIconSvg name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </aside>
  );
}
