import { describe, expect, it } from "vitest";
import { kindDomainMosaicItems, pickKindTarget } from "@/lib/kind-hub-ops";

describe("kind-hub-ops", () => {
  it("pickKindTarget prefers active workspace of the same kind", () => {
    const pick = pickKindTarget(
      [
        { id: "a", slug: "friends", name: "دوستان", template: "friends_family" },
        { id: "b", slug: "vida", name: "vidaverse", template: "friends_family" },
        { id: "c", slug: "me", name: "دفتر من", template: "personal" },
      ],
      "group",
      "b",
    );
    expect(pick?.slug).toBe("vida");
  });

  it("kindDomainMosaicItems counts drive list vs create", () => {
    const items = kindDomainMosaicItems({
      personal: 1,
      group: 3,
      building: 0,
      org: 0,
    });
    expect(items.find((i) => i.key === "kind-group")?.href).toBe(
      "/spaces?kind=group",
    );
    expect(items.find((i) => i.key === "kind-building")?.href).toBe(
      "/spaces/new?kind=building",
    );
  });
});
