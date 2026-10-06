import type { ContextualMosaicSection } from "@/lib/navigation-v2";

export type NavUsageTier = "starter" | "growing" | "full";

/**
 * Progressive feature unlock for mosaic density (Phase 3).
 * Thresholds use real dashboard counters — never invented.
 */
export function navUsageTierFromCounts(input: {
  postedExpenseCount: number;
  memberCount?: number;
}): NavUsageTier {
  const members = input.memberCount ?? 0;
  if (input.postedExpenseCount >= 10 || members >= 5) return "full";
  if (input.postedExpenseCount >= 3) return "growing";
  return "starter";
}

/** Advanced finance leaf keys deferred until growing/full. */
const STARTER_DEFER_FINANCE_KEYS = new Set([
  "recurring",
  "ledger",
  "invoices",
  "reports",
  "addons",
  "allowances",
  "org-finance",
  "cost-centers",
  "category-budgets",
]);

/**
 * Filter mosaic sections by usage tier. Does not remove routes — only default
 * mosaic discovery. Deep links and Tools (full) remain available.
 */
export function filterMosaicByUsageTier(
  sections: ContextualMosaicSection[],
  tier: NavUsageTier,
): ContextualMosaicSection[] {
  if (tier === "full") return sections;

  const hideDomains =
    tier === "starter"
      ? new Set(["oversight", "settings"])
      : new Set(["oversight"]);

  return sections
    .filter((section) => !hideDomains.has(section.key))
    .map((section) => {
      if (tier !== "starter" || section.key !== "finance") return section;
      return {
        ...section,
        items: section.items.filter(
          (item) => !STARTER_DEFER_FINANCE_KEYS.has(item.key),
        ),
      };
    })
    .filter((section) => section.items.length > 0);
}
