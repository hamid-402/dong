"use client";

import Link from "next/link";
import { ShellHeaderWayfinding } from "@/components/shell/shell-header-wayfinding";
import { useShellLocation } from "@/components/shell/shell-v2-context";
import { DirIcon } from "@/components/dir-icon";
import { useViewportMode } from "@/lib/use-viewport";
import { t } from "@/lib/i18n";

/**
 * Single path chrome: back target and crumbs come from the shared shell location.
 * Replaces the separate breadcrumb, page trail, and back bar in the header.
 */
export function ShellTrail() {
  const location = useShellLocation();
  const viewport = useViewportMode();
  if (!location) return null;
  const show = location.inWorkspace || !location.primary;
  if (!show || location.trail.length === 0) return null;

  const back = location.back;
  const place = back?.label || t("nav.back");
  const aria = back?.label ? t("nav.backTo", { place: back.label }) : t("nav.back");

  return (
    <div className="shell-page-trail shell-trail">
      {back ? (
        <Link
          href={back.href}
          className="shell-page-trail__back"
          aria-label={aria}
          title={aria}
        >
          <span className="shell-page-trail__back-icon" aria-hidden>
            <DirIcon flip={false}>→</DirIcon>
          </span>
          <span className="shell-page-trail__back-label">{place}</span>
        </Link>
      ) : null}
      <ShellHeaderWayfinding crumbs={location.trail} compact={viewport === "mobile"} />
    </div>
  );
}
