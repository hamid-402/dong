"use client";

import { useRouter } from "next/navigation";
import { AppBreadcrumb, type BreadcrumbCrumb } from "@/components/shell/app-breadcrumb";
import { DirIcon } from "@/components/dir-icon";
import { trailParentHref } from "@/lib/shell-breadcrumb";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";

function sameOriginReferrer(): boolean {
  if (typeof window === "undefined") return false;
  const ref = document.referrer;
  if (!ref) return true;
  try {
    return new URL(ref).origin === window.location.origin;
  } catch {
    return false;
  }
}

function collapseCrumbs(items: BreadcrumbCrumb[]): BreadcrumbCrumb[] {
  if (items.length <= 2) return items;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  return [first, { label: "…" }, last];
}

/**
 * Unified path chrome for Shell V2: back + breadcrumb (≤3).
 * Classic auth shells keep PageTrailBar; workspace/account use this.
 */
export function ShellPageTrail({
  items,
  fallbackHref = "/spaces",
}: {
  items: BreadcrumbCrumb[];
  fallbackHref?: string;
}) {
  const router = useRouter();
  const viewport = useViewportMode();
  const parentHref = trailParentHref(items, fallbackHref);
  if (items.length === 0) return null;

  const displayItems =
    viewport === "mobile" ? collapseCrumbs(items) : items.slice(0, 3);

  return (
    <div className="shell-page-trail" aria-label={t("nav.pageTrail")}>
      <button
        type="button"
        className="shell-page-trail__back"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1 && sameOriginReferrer()) {
            router.back();
            return;
          }
          router.push(parentHref || fallbackHref);
        }}
      >
        <span className="shell-page-trail__back-icon" aria-hidden>
          <DirIcon>→</DirIcon>
        </span>
        <span className="shell-page-trail__back-label">{t("nav.back")}</span>
      </button>
      <div className="shell-page-trail__crumbs">
        <AppBreadcrumb items={displayItems} />
      </div>
    </div>
  );
}
