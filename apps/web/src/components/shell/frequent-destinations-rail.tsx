"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  listPinnedDestinations,
  type PinnedDestination,
} from "@/lib/pinned-destinations";
import {
  rememberDestination,
  topUsedDestinations,
  type RecentDestination,
} from "@/lib/recent-destinations";
import {
  navigateWithViewTransition,
  prefetchRoute,
  softTileHaptic,
} from "@/lib/tile-press";
import { t } from "@/lib/i18n";

export type FrequentRailItem = {
  key: string;
  label: string;
  href: string;
  kind: "pin" | "frequent";
};

/**
 * Pin + frequency row (no drag-and-drop). Only live hrefs from the gated mosaic.
 */
export function buildFrequentRailItems(
  liveHrefs: Iterable<string>,
  options?: {
    pins?: PinnedDestination[];
    frequent?: RecentDestination[];
    limit?: number;
  },
): FrequentRailItem[] {
  const allowed = new Set(liveHrefs);
  const limit = options?.limit ?? 4;
  const pins = (options?.pins ?? listPinnedDestinations()).filter((p) =>
    allowed.has(p.href),
  );
  const frequent = (
    options?.frequent ??
    topUsedDestinations(limit, { liveHrefs: allowed })
  ).filter((row) => allowed.has(row.href));

  const out: FrequentRailItem[] = [];
  const seen = new Set<string>();
  for (const pin of pins) {
    if (seen.has(pin.href)) continue;
    seen.add(pin.href);
    out.push({
      key: pin.key,
      label: pin.label,
      href: pin.href,
      kind: "pin",
    });
    if (out.length >= limit) return out;
  }
  for (const row of frequent) {
    if (seen.has(row.href)) continue;
    seen.add(row.href);
    out.push({
      key: row.key,
      label: row.label,
      href: row.href,
      kind: "frequent",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function FrequentDestinationsRail({
  liveHrefs,
  reduceMotion = false,
  refreshKey = 0,
}: {
  liveHrefs: ReadonlySet<string> | string[];
  reduceMotion?: boolean;
  /** Bump after pin/navigation so the rail re-reads localStorage. */
  refreshKey?: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<FrequentRailItem[]>([]);
  const liveKey = useMemo(() => {
    const list = Array.isArray(liveHrefs) ? liveHrefs : [...liveHrefs];
    return list.slice().sort().join("|");
  }, [liveHrefs]);

  useEffect(() => {
    const hrefList = liveKey ? liveKey.split("|") : [];
    setItems(buildFrequentRailItems(hrefList));
  }, [liveKey, refreshKey]);

  if (items.length === 0) return null;

  return (
    <section
      className="frequent-rail"
      aria-label={t("shell.frequentRailLabel")}
    >
      <h2 className="frequent-rail__title">{t("shell.frequentRailTitle")}</h2>
      <ul className="frequent-rail__list">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`frequent-rail__chip frequent-rail__chip--${item.kind}`}
              onMouseEnter={() => prefetchRoute(router, item.href)}
              onFocus={() => prefetchRoute(router, item.href)}
              onTouchStart={() => prefetchRoute(router, item.href)}
              onPointerDown={() => softTileHaptic(reduceMotion)}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                rememberDestination({
                  key: item.key,
                  label: item.label,
                  href: item.href,
                });
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                ) {
                  return;
                }
                event.preventDefault();
                navigateWithViewTransition(() => {
                  router.push(item.href);
                }, reduceMotion);
              }}
            >
              <span className="frequent-rail__kind" aria-hidden>
                {item.kind === "pin" ? "★" : "↻"}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
