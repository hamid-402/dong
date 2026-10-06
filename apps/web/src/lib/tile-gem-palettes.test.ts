import { describe, expect, it } from "vitest";
import { assignKindGems, KIND_GEM_FAMILY } from "./tile-gem-palettes";

describe("assignKindGems", () => {
  it("keeps each space inside its kind family and distinct until the family is full", () => {
    const ids = ["a", "b", "c", "d"];
    const assigned = assignKindGems("group", ids);
    const family = new Set(KIND_GEM_FAMILY.group);
    const gems = ids.map((id) => assigned.get(id));
    expect(new Set(gems).size).toBe(ids.length);
    for (const gem of gems) expect(family.has(gem!)).toBe(true);
  });

  it("returns the same gem for the same id set", () => {
    const ids = ["org-2", "org-1"];
    const first = assignKindGems("org", ids);
    const second = assignKindGems("org", [...ids].reverse());
    expect(second.get("org-1")).toBe(first.get("org-1"));
    expect(second.get("org-2")).toBe(first.get("org-2"));
  });
});
