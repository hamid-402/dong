"use client";

import Link from "next/link";
import { useShellV2 } from "@/components/shell/shell-v2-context";

/**
 * Drill-down back + crumbs. Inside the product shell the header trail is the
 * single path, so this bar stays quiet and does not invent a second target.
 */
export function MosaicBackBar({
  backHref,
  backLabel = "برگشت",
  crumbs,
}: {
  backHref: string;
  backLabel?: string;
  crumbs: Array<{ label: string; href?: string }>;
}) {
  const inShell = useShellV2();
  if (inShell) return null;

  return (
    <div className="mosaicBackBar">
      <Link href={backHref} className="mosaicBackBar__back">
        ← {backLabel}
      </Link>
      <nav className="mosaicBackBar__trail" aria-label="مسیر">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="mosaicBackBar__crumbWrap">
            {index > 0 ? <span className="mosaicBackBar__sep" aria-hidden>/</span> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="mosaicBackBar__crumb">
                {crumb.label}
              </Link>
            ) : (
              <span className="mosaicBackBar__here">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
