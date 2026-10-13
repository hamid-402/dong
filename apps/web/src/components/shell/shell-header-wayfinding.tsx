"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";
import { t } from "@/lib/i18n";

export function splitWayfinding(crumbs: BreadcrumbCrumb[]): {
  title: string;
  ancestors: BreadcrumbCrumb[];
} {
  if (crumbs.length === 0) {
    return { title: "", ancestors: [] };
  }
  const title = crumbs[crumbs.length - 1]?.label ?? "";
  const ancestors = crumbs.slice(0, -1).filter((c) => c.label && c.label !== "…");
  return { title, ancestors };
}

/**
 * Header path. Optional root (خانه) is prefixed for workspace trails.
 * Long paths keep the root, the parent, and the current page.
 */
export function headerCrumbs(
  crumbs: BreadcrumbCrumb[],
  options?: { root?: BreadcrumbCrumb; roots?: BreadcrumbCrumb[]; compact?: boolean },
): BreadcrumbCrumb[] {
  const clean = crumbs.filter((c) => c.label && c.label !== "…");
  const roots = (options?.roots ?? (options?.root ? [options.root] : [])).filter(
    (crumb) => crumb.label,
  );
  const withRoot =
    roots.length > 0 &&
    clean[0]?.href !== roots[0]?.href &&
    clean[0]?.label !== roots[0]?.label
      ? [...roots, ...clean]
      : clean;
  const max = options?.compact ? 4 : 5;
  if (withRoot.length <= max) return withRoot;
  const first = withRoot[0]!;
  const parent = withRoot[withRoot.length - 2]!;
  const current = withRoot[withRoot.length - 1]!;
  return [first, { label: "…" }, parent, current];
}

/** Drop identity crumbs the space switcher already shows (name and kind). */
export function compactTrailCrumbs(
  crumbs: BreadcrumbCrumb[],
  omitLabels: readonly string[],
): BreadcrumbCrumb[] {
  const skip = new Set(omitLabels.map((label) => label.trim()).filter(Boolean));
  return crumbs.filter((crumb) => crumb.label && crumb.label !== "…" && !skip.has(crumb.label));
}

/**
 * Professional header breadcrumb — Linear/GitHub style:
 * muted ancestors → strong current page, thin separators, no noisy chrome.
 */
export function ShellHeaderWayfinding({
  crumbs,
  compact = false,
  dense = false,
  root,
}: {
  crumbs: BreadcrumbCrumb[];
  compact?: boolean;
  /** Short ancestor chain for the slim header line. Does not fold to the title. */
  dense?: boolean;
  /** Prefixed ancestor, usually خانه, when the trail starts inside a space. */
  root?: BreadcrumbCrumb;
}) {
  const clean = crumbs.filter((c) => c.label);
  const fullPath = (root?.label && clean[0]?.label !== root.label ? [root, ...clean] : clean)
    .map((c) => c.label)
    .join(" › ");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [fullPath]);
  if (clean.length === 0) return null;

  const canFold = compact && !dense && clean.length > 1;
  const items = dense
    ? headerCrumbs(clean, { root, compact: true })
    : canFold && !expanded
      ? [clean[clean.length - 1]!]
      : headerCrumbs(clean, { root, compact: false });

  return (
    <nav
      className={`shell-v2__wayfinding${compact ? " shell-v2__wayfinding--compact" : ""}${dense ? " shell-v2__wayfinding--slim" : ""}${expanded ? " is-expanded" : ""}`}
      aria-label={t("nav.pageTrail")}
      title={fullPath}
    >
      <ol className="shell-v2__crumb">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const isEllipsis = item.label === "…";
          return (
            <li
              key={`${item.label}-${index}`}
              className={`shell-v2__crumbItem${last ? " is-current" : ""}${isEllipsis ? " is-ellipsis" : ""}`}
            >
              {index > 0 ? (
                <span className="shell-v2__crumbSep" aria-hidden>
                  ‹
                </span>
              ) : null}
              {isEllipsis ? (
                <span className="shell-v2__crumbEllipsis" aria-hidden>
                  …
                </span>
              ) : last && canFold ? (
                <button
                  type="button"
                  className="shell-v2__crumbSeg shell-v2__crumbSeg--current shell-v2__crumbSeg--toggle"
                  aria-expanded={expanded}
                  aria-current="page"
                  onClick={() => setExpanded((open) => !open)}
                >
                  {item.label}
                </button>
              ) : last || !item.href ? (
                <span
                  className={`shell-v2__crumbSeg${last ? " shell-v2__crumbSeg--current" : " shell-v2__crumbSeg--muted"}`}
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="shell-v2__crumbSeg shell-v2__crumbSeg--link">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
