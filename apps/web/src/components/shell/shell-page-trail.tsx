"use client";

import Link from "next/link";
import { AppBreadcrumb, type BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";
import { DirIcon } from "@/components/dir-icon";
import { compactTrailCrumbs, ShellHeaderWayfinding } from "@/components/shell/shell-header-wayfinding";
import { trailParent } from "@/lib/shell-breadcrumb";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";

function collapseCrumbs(items: BreadcrumbCrumb[]): BreadcrumbCrumb[] {
  if (items.length <= 2) return items;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  return [first, { label: "…" }, last];
}

/**
 * Path chrome for subpages: one back control aimed at the parent crumb.
 * The destination matches the breadcrumb, so the button and the path agree.
 * `backOnly` — back control alone; the path lives in ShellHeaderWayfinding.
 */
export function ShellPageTrail({
  items,
  fallbackHref = "/home",
  backOnly = false,
  dense = false,
  omitLabels = [],
}: {
  items: BreadcrumbCrumb[];
  fallbackHref?: string;
  backOnly?: boolean;
  /** One quiet path for the header line under the main bar. */
  dense?: boolean;
  /** Labels already shown on the space switcher — kept out of the visible path. */
  omitLabels?: readonly string[];
}) {
  const viewport = useViewportMode();
  const parent = trailParent(items, fallbackHref);
  if (items.length === 0) return null;

  const omit = new Set(omitLabels.map((label) => label.trim()).filter(Boolean));
  const visible = omit.size > 0 ? compactTrailCrumbs(items, [...omit]) : items;
  if (dense && visible.length === 0) return null;

  const place = parent.label || t("nav.back");
  const aria = parent.label ? t("nav.backTo", { place: parent.label }) : t("nav.back");
  const showBackText = Boolean(parent.label) && !omit.has(parent.label);
  const displayItems = dense
    ? visible
    : viewport === "mobile"
      ? collapseCrumbs(visible)
      : visible.slice(0, 3);

  return (
    <div
      className={`shell-page-trail${backOnly ? " shell-page-trail--backOnly" : ""}${dense ? " shell-page-trail--slim" : ""}`}
      aria-label={t("nav.pageTrail")}
    >
      <Link
        href={parent.href}
        className={`shell-page-trail__back${showBackText ? "" : " shell-page-trail__back--icon"}`}
        aria-label={aria}
        title={aria}
      >
        <span className="shell-page-trail__back-icon" aria-hidden>
          <DirIcon flip={false}>→</DirIcon>
        </span>
        {showBackText ? <span className="shell-page-trail__back-label">{place}</span> : null}
      </Link>
      {backOnly ? null : dense ? (
        <ShellHeaderWayfinding crumbs={displayItems} dense />
      ) : (
        <div className="shell-page-trail__crumbs">
          <AppBreadcrumb items={displayItems} />
        </div>
      )}
    </div>
  );
}
