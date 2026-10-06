import { describe, expect, it } from "vitest";
import { kindDomainMosaicItems, pickKindTarget } from "@/lib/kind-hub-ops";

describe("kind-hub-ops", () => {
  it("pickKindTarget prefers active workspace of the same kind", () => {
    const pick = pickKindTarget(
      [
        { id: "a", slug: "friends", name: "دوستان", template: "friends_family" },
        { id: "b", slug: "demo-group", name: "گروه نمونه", template: "friends_family" },
        { id: "c", slug: "me", name: "دفتر من", template: "personal" },
      ],
      "group",
      "b",
    );
    expect(pick?.slug).toBe("demo-group");
  });

  it("kindDomainMosaicItems counts drive list vs create", () => {
    const items = kindDomainMosaicItems({
      personal: 1,
      group: 3,
      building: 0,
      org: 0,
    });
    expect(items.find((i) => i.key === "kind-group")?.href).toBe(
      "/home?kind=group",
    );
    expect(items.find((i) => i.key === "kind-building")?.href).toBe(
      "/spaces/new?kind=building",
    );
  });

  it("kindDomainMosaicItems can omit building and org", () => {
    const items = kindDomainMosaicItems(
      { personal: 0, group: 1, building: 2, org: 3 },
      (kind) => kind === "personal" || kind === "group",
    );
    expect(items.map((item) => item.key)).toEqual(["kind-personal", "kind-group"]);
  });
});
