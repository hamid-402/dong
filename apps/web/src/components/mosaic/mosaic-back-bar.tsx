"use client";

import { useMosaicNav } from "@/components/mosaic/mosaic-nav-context";

/** Sticky path + back control for every hub surface (browse and content). */
export function MosaicBackBar() {
  const { pop, breadcrumbTrail, goToBreadcrumb, depth } = useMosaicNav();
  const canGoBack = depth > 0;

  if (!canGoBack) {
    return null;
  }

  return (
    <div className="mosaic-back-bar mosaic-back-bar--rich mosaic-back-bar--sticky">
      <button type="button" className="mosaic-back-bar__back" onClick={pop}>
        <span className="mosaic-back-bar__arrow" aria-hidden>
          →
        </span>
        بازگشت
      </button>
      <nav className="mosaic-back-bar__breadcrumb" aria-label="مسیر">
        <button
          type="button"
          className={`mosaic-back-bar__crumb${breadcrumbTrail.length === 0 ? " is-current" : ""}`}
          onClick={() => goToBreadcrumb(-1)}
        >
          خانه
        </button>
        {breadcrumbTrail.map((node, i) => (
          <span key={`${node.key}-${i}`} className="mosaic-back-bar__item">
            <span className="mosaic-back-bar__sep" aria-hidden>
              /
            </span>
            <button
              type="button"
              className={`mosaic-back-bar__crumb${i === breadcrumbTrail.length - 1 ? " is-current" : ""}`}
              onClick={() => goToBreadcrumb(i)}
            >
              {node.label}
            </button>
          </span>
        ))}
      </nav>
    </div>
  );
}
