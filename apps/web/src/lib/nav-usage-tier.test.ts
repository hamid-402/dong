/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  filterMosaicByUsageTier,
  navUsageTierFromCounts,
} from "./nav-usage-tier";
import type { ContextualMosaicSection } from "@/lib/navigation-v2";

const sample: ContextualMosaicSection[] = [
  {
    key: "finance",
    label: "مالی",
    items: [
      {
        key: "expenses",
        label: "خرج",
        href: "/w/x/expenses",
        summary: "s",
        intent: "record",
        icon: "receipt",
      },
      {
        key: "recurring",
        label: "تکرار",
        href: "/w/x/recurring",
        summary: "s",
        intent: "manage",
        icon: "receipt",
      },
      {
        key: "settlements",
        label: "تسویه",
        href: "/w/x/settlements",
        summary: "s",
        intent: "decide",
        icon: "wallet",
      },
    ],
  },
  {
    key: "oversight",
    label: "نظارت",
    items: [
      {
        key: "security",
        label: "امنیت",
        href: "/w/x/security-ops",
        summary: "s",
        intent: "monitor",
        icon: "shield",
      },
    ],
  },
];

describe("navUsageTierFromCounts", () => {
  it("maps posted counts to tiers", () => {
    expect(navUsageTierFromCounts({ postedExpenseCount: 0 })).toBe("starter");
    expect(navUsageTierFromCounts({ postedExpenseCount: 3 })).toBe("growing");
    expect(navUsageTierFromCounts({ postedExpenseCount: 10 })).toBe("full");
    expect(
      navUsageTierFromCounts({ postedExpenseCount: 1, memberCount: 5 }),
    ).toBe("full");
  });
});

describe("filterMosaicByUsageTier", () => {
  it("hides oversight and deferred finance on starter", () => {
    const filtered = filterMosaicByUsageTier(sample, "starter");
    expect(filtered.map((s) => s.key)).toEqual(["finance"]);
    expect(filtered[0]?.items.map((i) => i.key).sort()).toEqual([
      "expenses",
      "settlements",
    ]);
  });

  it("keeps finance advanced on growing but still hides oversight", () => {
    const filtered = filterMosaicByUsageTier(sample, "growing");
    expect(filtered.map((s) => s.key)).toEqual(["finance"]);
    expect(filtered[0]?.items.some((i) => i.key === "recurring")).toBe(true);
  });

  it("returns all on full", () => {
    expect(filterMosaicByUsageTier(sample, "full")).toEqual(sample);
  });
});
