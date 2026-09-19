import { describe, expect, it } from "vitest";
import {
  buildSplitPayloadFromComposer,
  emptySplitComposer,
  splitComposerFromExpense,
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

  it("itemized catalog line carries catalogItemId and qty×price amount", () => {
    const value = emptySplitComposer("shared");
    value.splitMethod = "itemized";
    value.items = [
      {
        key: "soda",
        title: "نوشابه",
        toman: "99999",
        assigneeUserIds: ["a"],
        catalogItemId: "cat-1",
        unitCode: "piece",
        quantity: 2,
        unitPriceMinor: "300000",
      },
    ];
    const payload = buildSplitPayloadFromComposer(value);
    expect(payload.items?.[0]?.catalogItemId).toBe("cat-1");
    expect(payload.items?.[0]?.quantity).toBe(2);
    expect(payload.items?.[0]?.amount.amountMinor).toBe("600000");
    expect(payload.totalMinor).toBe("600000");
  });

  it("multi-payer builds paymentLines in IRR minor", () => {
    const value = emptySplitComposer("shared");
    value.splitMethod = "equal";
    value.participantUserIds = ["a", "b"];
    value.multiPayer = true;
    value.payerInputs = { a: "700", b: "300" };
    const payload = buildSplitPayloadFromComposer(value);
    expect(payload.paymentLines).toEqual([
      { userId: "a", amount: { amountMinor: "7000", currency: "IRR" } },
      { userId: "b", amount: { amountMinor: "3000", currency: "IRR" } },
    ]);
    expect(payload.paidByUserId).toBe("a");
  });

  it("G03 revise loads itemized lines into composer", () => {
    const next = splitComposerFromExpense(
      {
        visibility: "shared",
        participantUserIds: ["a", "b"],
        paidByUserId: "a",
        splitMethod: "itemized",
        splits: [],
        items: [
          {
            title: "پیش‌غذا",
            amount: { amountMinor: "20000", currency: "IRR" },
            assigneeUserIds: ["a", "b"],
          },
          {
            title: "غذای a",
            amount: { amountMinor: "50000", currency: "IRR" },
            assigneeUserIds: ["a"],
          },
        ],
        tip: { amountMinor: "10000", currency: "IRR" },
      },
      (minor) => String(Math.round(Number(minor) / 10)),
    );
    expect(next.splitMethod).toBe("itemized");
    expect(next.items).toHaveLength(2);
    expect(next.items[0]?.title).toBe("پیش‌غذا");
    expect(next.items[0]?.toman).toBe("2000");
    expect(next.tipToman).toBe("1000");
    expect(next.participantUserIds.sort()).toEqual(["a", "b"]);
  });
});
