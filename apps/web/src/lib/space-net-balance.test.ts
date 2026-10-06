import { describe, expect, it } from "vitest";
import {
  aggregateSpaceNets,
  groupSpaceNetsByKind,
  netFromIrrMinor,
  sortPeersByAbsNet,
  type SpaceNetRow,
} from "./space-net-balance";

describe("netFromIrrMinor", () => {
  it("marks positive as credit", () => {
    const n = netFromIrrMinor(10_000, "toman");
    expect(n.tone).toBe("credit");
    expect(n.toman).toBe(1000);
    expect(n.irrMinor).toBe(10_000);
    expect(n.label).toContain("طلب");
  });

  it("marks negative as debt", () => {
    const n = netFromIrrMinor("-5000", "rial");
    expect(n.tone).toBe("debt");
    expect(n.label).toContain("بدهی");
  });

  it("marks zero as settled", () => {
    expect(netFromIrrMinor(0).tone).toBe("settled");
  });
});

describe("aggregateSpaceNets", () => {
  it("sums credits and debts across spaces of one kind", () => {
    const rows: SpaceNetRow[] = [
      {
        workspaceId: "a",
        slug: "trip",
        name: "سفر",
        spaceKind: "group",
        net: netFromIrrMinor(20_000),
        openSettlements: 1,
      },
      {
        workspaceId: "b",
        slug: "home",
        name: "خانه",
        spaceKind: "group",
        net: netFromIrrMinor("-5000"),
        openSettlements: 2,
      },
      {
        workspaceId: "c",
        slug: "ok",
        name: "تسویه",
        spaceKind: "group",
        net: netFromIrrMinor(0),
        openSettlements: 0,
      },
    ];
    const agg = aggregateSpaceNets(rows);
    expect(agg.youAreOwedToman).toBe(2000);
    expect(agg.youOweToman).toBe(500);
    expect(agg.openSettlements).toBe(3);
    expect(agg.unsettledCount).toBe(2);
    expect(agg.topCredit?.slug).toBe("trip");
    expect(agg.topDebt?.slug).toBe("home");
  });
});

describe("groupSpaceNetsByKind", () => {
  it("keeps ledgers separate and never merges kinds", () => {
    const rows: SpaceNetRow[] = [
      {
        workspaceId: "g1",
        slug: "friends",
        name: "دوستان",
        spaceKind: "group",
        net: netFromIrrMinor(10_000),
        openSettlements: 0,
      },
      {
        workspaceId: "b1",
        slug: "tower",
        name: "برج",
        spaceKind: "building",
        net: netFromIrrMinor(-20_000),
        openSettlements: 1,
      },
      {
        workspaceId: "p1",
        slug: "me",
        name: "من",
        spaceKind: "personal",
        net: netFromIrrMinor(5_000),
        openSettlements: 0,
      },
    ];
    const groups = groupSpaceNetsByKind(rows);
    expect(groups.map((g) => g.kind)).toEqual(["personal", "group", "building"]);
    expect(groups.find((g) => g.kind === "group")?.aggregate.youAreOwedToman).toBe(1000);
    expect(groups.find((g) => g.kind === "building")?.aggregate.youOweToman).toBe(2000);
    expect(groups.find((g) => g.kind === "personal")?.aggregate.youAreOwedToman).toBe(500);
  });

  it("filters to a single kind when onlyKind is set", () => {
    const rows: SpaceNetRow[] = [
      {
        workspaceId: "g1",
        slug: "friends",
        name: "دوستان",
        spaceKind: "group",
        net: netFromIrrMinor(10_000),
        openSettlements: 0,
      },
      {
        workspaceId: "b1",
        slug: "tower",
        name: "برج",
        spaceKind: "building",
        net: netFromIrrMinor(-20_000),
        openSettlements: 1,
      },
    ];
    const only = groupSpaceNetsByKind(rows, "building");
    expect(only).toHaveLength(1);
    expect(only[0]?.kind).toBe("building");
    expect(only[0]?.aggregate.youOweToman).toBe(2000);
  });
});

describe("sortPeersByAbsNet", () => {
  it("orders by absolute toman descending", () => {
    const sorted = sortPeersByAbsNet([
      { userId: "1", amountMinor: "1000" },
      { userId: "2", amountMinor: "-9000" },
      { userId: "3", amountMinor: "0" },
    ]);
    expect(sorted.map((p) => p.userId)).toEqual(["2", "1"]);
  });
});
