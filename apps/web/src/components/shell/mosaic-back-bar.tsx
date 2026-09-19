"use client";

import Link from "next/link";

/**
 * Mosaic drill-down chrome — back + breadcrumb (prompt MosaicBackBar).
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
