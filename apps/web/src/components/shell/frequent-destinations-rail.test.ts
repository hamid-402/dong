/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { buildFrequentRailItems } from "@/components/shell/frequent-destinations-rail";

describe("buildFrequentRailItems", () => {
  it("puts pins before frequency and dedupes by href", () => {
    const items = buildFrequentRailItems(["/a", "/b", "/c"], {
      pins: [
        {
          key: "b",
          label: "B",
          href: "/b",
          pinnedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      frequent: [
        {
          key: "a",
          label: "A",
          href: "/a",
          visitedAt: "2026-01-02T00:00:00.000Z",
          visitCount: 5,
        },
        {
          key: "b",
          label: "B again",
          href: "/b",
          visitedAt: "2026-01-03T00:00:00.000Z",
          visitCount: 9,
        },
        {
          key: "c",
          label: "C",
          href: "/c",
          visitedAt: "2026-01-04T00:00:00.000Z",
          visitCount: 2,
        },
      ],
      limit: 3,
    });
    expect(items.map((i) => i.href)).toEqual(["/b", "/a", "/c"]);
    expect(items[0]?.kind).toBe("pin");
    expect(items[1]?.kind).toBe("frequent");
  });

  it("drops hrefs not in the live set", () => {
    const items = buildFrequentRailItems(["/a"], {
      frequent: [
        {
          key: "x",
          label: "X",
          href: "/x",
          visitedAt: "2026-01-01T00:00:00.000Z",
          visitCount: 99,
        },
      ],
    });
    expect(items).toEqual([]);
  });
});
