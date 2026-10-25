import { describe, expect, it } from "vitest";
import type { WorkspaceTemplateCatalogItem } from "@dang/contracts";
import { filterVisibleTemplates } from "./onboarding-view";

const catalog: WorkspaceTemplateCatalogItem[] = [
  {
    id: "friends_family",
    titleFa: "گروه دوستانه",
    summaryFa: "خرج مشترک",
    defaultModules: ["expenses"],
    spaceKind: "group",
  },
  {
    id: "personal",
    titleFa: "شخصی",
    summaryFa: "دفتر من",
    defaultModules: ["expenses"],
    spaceKind: "personal",
  },
  {
    id: "residential_building",
    titleFa: "ساختمان",
    summaryFa: "شارژ",
    defaultModules: ["expenses"],
    spaceKind: "building",
  },
];

describe("filterVisibleTemplates", () => {
  it("returns only API catalog rows — empty catalog stays empty (no fake fallback)", () => {
    expect(filterVisibleTemplates([], null)).toEqual([]);
    expect(filterVisibleTemplates([], "group")).toEqual([]);
  });

  it("filters by space kind without inventing missing kinds", () => {
    expect(filterVisibleTemplates(catalog, "group").map((t) => t.id)).toEqual([
      "friends_family",
    ]);
    expect(filterVisibleTemplates(catalog, "org")).toEqual([]);
  });

  it("keeps full catalog when no kind filter", () => {
    expect(filterVisibleTemplates(catalog, null)).toHaveLength(3);
  });
});
