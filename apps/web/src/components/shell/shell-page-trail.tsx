"use client";

import Link from "next/link";
import { AppBreadcrumb, type BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";
import { DirIcon } from "@/components/dir-icon";
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
}: {
  items: BreadcrumbCrumb[];
  fallbackHref?: string;
  backOnly?: boolean;
}) {
  const viewport = useViewportMode();
  const parent = trailParent(items, fallbackHref);
  if (items.length === 0) return null;

  const place = parent.label || t("nav.back");
  const aria = parent.label ? t("nav.backTo", { place: parent.label }) : t("nav.back");
  const displayItems =
    viewport === "mobile" ? collapseCrumbs(items) : items.slice(0, 3);

  return (
    <div
      className={`shell-page-trail${backOnly ? " shell-page-trail--backOnly" : ""}`}
      aria-label={t("nav.pageTrail")}
    >
      <Link
        href={parent.href}
        className="shell-page-trail__back"
        aria-label={aria}
        title={aria}
      >
        <span className="shell-page-trail__back-icon" aria-hidden>
          <DirIcon flip={false}>→</DirIcon>
        </span>
        <span className="shell-page-trail__back-label">{place}</span>
      </Link>
      {backOnly ? null : (
        <div className="shell-page-trail__crumbs">
          <AppBreadcrumb items={displayItems} />
        </div>
      )}
    </div>
  );
}
