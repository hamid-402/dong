import { describe, expect, it } from "vitest";
import {
  buildSplitPayloadFromComposer,
  emptySplitComposer,
} from "./split-composer";

describe("buildSplitPayloadFromComposer", () => {
  it("equal split keeps participant ids", () => {
    const value = emptySplitComposer("shared");
    value.splitMethod = "equal";
    value.participantUserIds = ["a", "b"];
    expect(buildSplitPayloadFromComposer(value)).toEqual({
      splitMethod: "equal",
      participantUserIds: ["a", "b"],
    });
  });

  it("amount split converts toman lines to IRR minor", () => {
    const value = emptySplitComposer("shared");
    value.splitMethod = "amount";
    value.participantUserIds = ["a", "b"];
    value.lineInputs = { a: "600", b: "400" };
    const payload = buildSplitPayloadFromComposer(value);
    expect(payload.splitMethod).toBe("amount");
    expect(payload.splitLines).toEqual([
      { userId: "a", amount: { amountMinor: "6000", currency: "IRR" } },
      { userId: "b", amount: { amountMinor: "4000", currency: "IRR" } },
    ]);
  });

  it("itemized derives total from items + tip", () => {
    const value = emptySplitComposer("shared");
    value.splitMethod = "itemized";
    value.items = [
      {
        key: "1",
        title: "غذا",
        toman: "1000",
        assigneeUserIds: ["a", "b"],
      },
    ];
    value.tipToman = "100";
    const payload = buildSplitPayloadFromComposer(value);
    expect(payload.splitMethod).toBe("itemized");
    expect(payload.totalMinor).toBe("11000");
    expect(payload.tip?.amountMinor).toBe("1000");
    expect(payload.items?.length).toBe(1);
  });
});
