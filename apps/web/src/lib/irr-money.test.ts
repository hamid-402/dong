import { describe, expect, it } from "vitest";
import { assertIrrMoney, tomanInputToIrrMinor } from "./irr-money";
import { formatToman } from "@dang/ui";

describe("tomanInputToIrrMinor", () => {
  it("converts positive toman to IRR minor (×10)", () => {
    expect(tomanInputToIrrMinor("1000")).toEqual({
      amountMinor: "10000",
      currency: "IRR",
    });
  });

  it("strips commas and rejects non-positive", () => {
    expect(tomanInputToIrrMinor("1,250")).toEqual({
      amountMinor: "12500",
      currency: "IRR",
    });
    expect(tomanInputToIrrMinor("0")).toBeNull();
    expect(tomanInputToIrrMinor("-5")).toBeNull();
    expect(tomanInputToIrrMinor("")).toBeNull();
  });
});

describe("assertIrrMoney", () => {
  it("accepts valid IRR minor", () => {
    expect(assertIrrMoney({ amountMinor: "10", currency: "IRR" })).toBe(true);
  });

  it("rejects bad shapes", () => {
    expect(assertIrrMoney(null)).toBe(false);
    expect(assertIrrMoney({ amountMinor: "0", currency: "IRR" })).toBe(false);
    expect(assertIrrMoney({ amountMinor: "-1", currency: "IRR" })).toBe(false);
    expect(assertIrrMoney({ amountMinor: "10", currency: "USD" as "IRR" })).toBe(
      false,
    );
  });
});

describe("formatToman (from @dang/ui)", () => {
  it("produces fa-IR digits; LTR wrapper is an Amount concern not the format string", () => {
    const s = formatToman(1_250_000);
    expect(s).toMatch(/[۰-۹]/);
    expect(s).not.toMatch(/[0-9]/);
    // Plain format string has no dir attribute — Amount component adds dir="ltr".
    expect(s.includes("dir=")).toBe(false);
  });
});
