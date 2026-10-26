import { describe, expect, it } from "vitest";
import {
  absIrrMinor,
  formatNetBalanceLabel,
  netBalancePhrase,
  netBalanceTone,
} from "./net-amount-display";

describe("net-amount-display (IRR minor → wording)", () => {
  it("treats storage as IRR minor (rial); toman display divides by 10", () => {
    // 12_000 rial → 1_200 toman
    expect(formatNetBalanceLabel(12_000, "toman")).toMatch(/طلب شما/);
    expect(formatNetBalanceLabel(12_000, "toman")).toMatch(/۱٬۲۰۰/);
    expect(formatNetBalanceLabel(12_000, "toman")).toMatch(/تومان/);
    expect(formatNetBalanceLabel(12_000, "rial")).toMatch(/۱۲٬۰۰۰/);
    expect(formatNetBalanceLabel(12_000, "rial")).toMatch(/ریال/);
  });

  it("uses بدهی شما for negative net without +/- signs", () => {
    const label = formatNetBalanceLabel(-5_000, "toman");
    expect(label).toMatch(/بدهی شما/);
    expect(label).toMatch(/۵۰۰/);
    expect(label).not.toMatch(/[+\-−]/);
  });

  it("settled is تسویه", () => {
    expect(formatNetBalanceLabel(0, "toman")).toBe("تسویه");
    expect(netBalanceTone(0)).toBe("settled");
  });

  it("party perspective keeps طلبکار/بدهکار", () => {
    expect(netBalancePhrase("credit", "party")).toBe("طلبکار");
    expect(netBalancePhrase("debt", "party")).toBe("بدهکار");
    expect(formatNetBalanceLabel(1000, "toman", "party")).toMatch(/طلبکار/);
  });

  it("absIrrMinor strips sign for display Amount inputs", () => {
    expect(absIrrMinor("-2500")).toBe("2500");
    expect(absIrrMinor(2500n)).toBe("2500");
  });
});
