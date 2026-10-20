import { describe, expect, it } from "vitest";
import {
  assertIrrMoney,
  displayInputToIrrMinor,
  irrMinorToDisplayInput,
  normalizeMoneyInput,
  tomanInputToIrrMinor,
} from "./irr-money";
import { formatToman } from "@dang/ui";

describe("normalizeMoneyInput", () => {
  it("strips Persian/ASCII thousand separators and spaces", () => {
    expect(normalizeMoneyInput("۱٬۲۵۰")).toBe("1250");
    expect(normalizeMoneyInput("1,250")).toBe("1250");
    expect(normalizeMoneyInput("1 250")).toBe("1250");
  });

  it("maps Persian digits to Latin", () => {
    expect(normalizeMoneyInput("۱۲۳۴")).toBe("1234");
  });
});

describe("displayInputToIrrMinor", () => {
  it("keeps rial scale and multiplies toman ×10", () => {
    expect(displayInputToIrrMinor("1000", "rial")).toEqual({
      amountMinor: "1000",
      currency: "IRR",
    });
    expect(displayInputToIrrMinor("1000", "toman")).toEqual({
      amountMinor: "10000",
      currency: "IRR",
    });
  });

  it("accepts Persian digits and grouping in both units", () => {
    expect(displayInputToIrrMinor("۱٬۲۵۰", "toman")).toEqual({
      amountMinor: "12500",
      currency: "IRR",
    });
    expect(displayInputToIrrMinor("۱٬۲۵۰", "rial")).toEqual({
      amountMinor: "1250",
      currency: "IRR",
    });
  });

  it("strips ASCII commas", () => {
    expect(displayInputToIrrMinor("1,250", "toman")).toEqual({
      amountMinor: "12500",
      currency: "IRR",
    });
    expect(displayInputToIrrMinor("1,250", "rial")).toEqual({
      amountMinor: "1250",
      currency: "IRR",
    });
  });

  it("rejects zero and negative", () => {
    expect(displayInputToIrrMinor("0", "toman")).toBeNull();
    expect(displayInputToIrrMinor("0", "rial")).toBeNull();
    expect(displayInputToIrrMinor("-5", "toman")).toBeNull();
    expect(displayInputToIrrMinor("-5", "rial")).toBeNull();
    expect(displayInputToIrrMinor("", "toman")).toBeNull();
  });
});

describe("irrMinorToDisplayInput", () => {
  it("converts IRR minor to toman or rial display strings", () => {
    expect(irrMinorToDisplayInput("10000", "toman")).toBe("1000");
    expect(irrMinorToDisplayInput("10000", "rial")).toBe("10000");
  });

  it("returns empty for zero or invalid", () => {
    expect(irrMinorToDisplayInput("0", "toman")).toBe("");
    expect(irrMinorToDisplayInput("-1", "toman")).toBe("");
  });
});

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
