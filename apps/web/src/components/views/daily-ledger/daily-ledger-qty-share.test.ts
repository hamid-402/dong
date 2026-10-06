import { describe, expect, it } from "vitest";
import {
  formatLedgerQuantity,
  ledgerUnitLabelFa,
  memberDayDepositCreditMinor,
  memberDayShareMinor,
} from "./daily-ledger-utils";

describe("ledgerUnitLabelFa", () => {
  it("maps piece to Persian and hides unknown English", () => {
    expect(ledgerUnitLabelFa("piece")).toBe("عدد");
    expect(ledgerUnitLabelFa("kg")).toBe("کیلو");
    expect(ledgerUnitLabelFa("foobar")).toBeNull();
  });
});

describe("formatLedgerQuantity", () => {
  it("shows only the number — never «عدد»", () => {
    expect(formatLedgerQuantity(1, "piece")).toEqual({ qty: "۱", unit: null });
    expect(formatLedgerQuantity(2, null)).toEqual({ qty: "۲", unit: null });
    expect(formatLedgerQuantity(undefined, "piece")).toEqual({
      qty: "۱",
      unit: null,
    });
    expect(formatLedgerQuantity(undefined, null)).toEqual({
      qty: "۱",
      unit: null,
    });
    expect(formatLedgerQuantity(3, "kg")).toEqual({ qty: "۳", unit: "کیلو" });
  });
});

describe("memberDayShareMinor", () => {
  it("adds equal shared share to personal", () => {
    const a = memberDayShareMinor("100", "1000", 3, 0);
    const b = memberDayShareMinor("200", "1000", 3, 1);
    const c = memberDayShareMinor("0", "1000", 3, 2);
    expect(a.sharedShare).toBe("334");
    expect(b.sharedShare).toBe("333");
    expect(c.sharedShare).toBe("333");
    expect(a.consumption).toBe("434");
    expect(a.total).toBe("434");
    expect(b.total).toBe("533");
    expect(c.total).toBe("333");
    expect(
      BigInt(a.sharedShare) + BigInt(b.sharedShare) + BigInt(c.sharedShare),
    ).toBe(1000n);
  });

  it("subtracts balance-mode deposit credit from net share", () => {
    const row = memberDayShareMinor("100", "0", 1, 0, "40");
    expect(row.consumption).toBe("100");
    expect(row.depositCredit).toBe("40");
    expect(row.total).toBe("60");
  });
});

describe("memberDayDepositCreditMinor", () => {
  it("sums topup/return for the cash-in member only", () => {
    const deposits = [
      {
        kind: "topup",
        amountMinor: "500",
        cashInByUserId: "u1",
        actorUserId: "u1",
      },
      {
        kind: "gift",
        amountMinor: "999",
        cashInByUserId: "u1",
        actorUserId: "u1",
      },
      {
        kind: "topup",
        amountMinor: "100",
        cashInByUserId: "u2",
        actorUserId: "u2",
      },
    ];
    expect(memberDayDepositCreditMinor(deposits, "u1")).toBe("500");
    expect(memberDayDepositCreditMinor(deposits, "u2")).toBe("100");
  });
});
