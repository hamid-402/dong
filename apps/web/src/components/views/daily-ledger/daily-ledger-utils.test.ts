/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import type { DailyLedgerResponse } from "@dang/contracts";
import {
  adjacentLedgerDates,
  preferIndividualMemberUserId,
  projectDepositNetMinor,
  projectFundBalanceAfterDeposit,
} from "./daily-ledger-utils";

const ledger: DailyLedgerResponse = {
  workspaceId: "w1",
  from: "2026-09-08",
  to: "2026-09-10",
  members: [],
  days: [
    {
      date: "2026-09-08",
      weekday: 2,
      isHoliday: false,
      isRangeLocked: false,
      shared: { items: [], total: { amountMinor: "0", currency: "IRR" } },
      members: {},
      dayTotal: { amountMinor: "0", currency: "IRR" },
      fundDeposits: [],
    },
    {
      date: "2026-09-09",
      weekday: 3,
      isHoliday: false,
      isRangeLocked: false,
      shared: { items: [], total: { amountMinor: "0", currency: "IRR" } },
      members: {},
      dayTotal: { amountMinor: "0", currency: "IRR" },
      fundDeposits: [],
    },
    {
      date: "2026-09-10",
      weekday: 4,
      isHoliday: false,
      isRangeLocked: false,
      shared: { items: [], total: { amountMinor: "0", currency: "IRR" } },
      members: {},
      dayTotal: { amountMinor: "0", currency: "IRR" },
      fundDeposits: [],
    },
  ],
  totals: {
    members: {},
    shared: { amountMinor: "0", currency: "IRR" },
    grand: { amountMinor: "0", currency: "IRR" },
  },
  rangeLocks: [],
  canManageLocks: false,
  source: { expense: "memory", dayMeta: "memory" },
};

describe("adjacentLedgerDates", () => {
  it("resolves prev/next inside range", () => {
    expect(adjacentLedgerDates(ledger, "2026-09-09")).toEqual({
      prev: "2026-09-08",
      next: "2026-09-10",
    });
    expect(adjacentLedgerDates(ledger, "2026-09-08").prev).toBeNull();
    expect(adjacentLedgerDates(ledger, "2026-09-10").next).toBeNull();
    expect(adjacentLedgerDates(ledger, "2099-01-01")).toEqual({
      prev: null,
      next: null,
    });
  });
});

describe("preferIndividualMemberUserId", () => {
  const members = [{ userId: "a" }, { userId: "b" }, { userId: "me" }];

  it("prefers last-used, then self, then first", () => {
    expect(
      preferIndividualMemberUserId(members, { preferUserId: "me", lastUserId: "b" }),
    ).toBe("b");
    expect(
      preferIndividualMemberUserId(members, { preferUserId: "me", lastUserId: null }),
    ).toBe("me");
    expect(preferIndividualMemberUserId(members, {})).toBe("a");
    expect(preferIndividualMemberUserId([], { preferUserId: "me" })).toBeNull();
  });
});

describe("deposit projections", () => {
  it("credits member net only in balance mode", () => {
    expect(projectDepositNetMinor("-500000", "200000", "balance")).toBe("-300000");
    expect(projectDepositNetMinor("-500000", "200000", "gift")).toBe("-500000");
  });

  it("adds to fund balance", () => {
    expect(projectFundBalanceAfterDeposit("1000000", "250000")).toBe("1250000");
  });
});
