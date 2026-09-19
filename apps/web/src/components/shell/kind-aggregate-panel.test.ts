import { describe, expect, it } from "vitest";
import { netsToShareSeries } from "@/lib/chart-format";
import type { SpaceNetRow } from "@/lib/space-net-balance";

describe("kind aggregate chart feed", () => {
  it("builds share series from kind net rows", () => {
    const rows: SpaceNetRow[] = [
      {
        workspaceId: "1",
        slug: "a",
        name: "A",
        spaceKind: "group",
        net: { toman: 100_000, label: "طلب", tone: "credit" },
        openSettlements: 0,
      },
      {
        workspaceId: "2",
        slug: "b",
        name: "B",
        spaceKind: "group",
        net: { toman: -250_000, label: "بدهی", tone: "debt" },
        openSettlements: 1,
      },
    ];
    const series = netsToShareSeries(rows);
    expect(series.points[0]?.key).toBe("2");
    expect(series.points).toHaveLength(2);
  });
});
