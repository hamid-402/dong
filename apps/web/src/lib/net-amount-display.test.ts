import { describe, expect, it } from "vitest";
import {
  absIrrMinor,
  formatNetBalanceLabel,
  netBalancePhrase,
  netBalanceTone,
  netDisplayAmountInteger,
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

  it("abs then truncate: 12345 rial → طلب شما ۱٬۲۳۴ تومان", () => {
    expect(netBalanceTone(12_345)).toBe("credit");
    expect(netDisplayAmountInteger(12_345, "toman")).toBe(1234n);
    expect(formatNetBalanceLabel(12_345, "toman")).toBe("طلب شما ۱٬۲۳۴ تومان");
  });

  it("abs then truncate: -12345 rial → بدهی شما ۱٬۲۳۴ تومان (sign only for label)", () => {
    expect(netBalanceTone(-12_345)).toBe("debt");
    expect(netDisplayAmountInteger(-12_345, "toman")).toBe(1234n);
    expect(absIrrMinor(-12_345)).toBe("12345");
    const label = formatNetBalanceLabel(-12_345, "toman");
    expect(label).toBe("بدهی شما ۱٬۲۳۴ تومان");
    expect(label).not.toMatch(/[+\-−]/);
  });

  it("0 is تسویه (no amount)", () => {
    expect(netBalanceTone(0)).toBe("settled");
    expect(netDisplayAmountInteger(0, "toman")).toBe(0n);
    expect(formatNetBalanceLabel(0, "toman")).toBe("تسویه");
    expect(formatNetBalanceLabel(0, "rial")).toBe("تسویه");
  });

  it("9 rial truncates to 0 تومان but remains طلب شما", () => {
    expect(netBalanceTone(9)).toBe("credit");
    expect(netDisplayAmountInteger(9, "toman")).toBe(0n);
    expect(formatNetBalanceLabel(9, "toman")).toBe("طلب شما ۰ تومان");
  });
});
