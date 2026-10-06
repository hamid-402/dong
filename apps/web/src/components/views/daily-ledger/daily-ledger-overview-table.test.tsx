/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DailyLedgerResponse } from "@dang/contracts";
import { DailyLedgerOverviewTable } from "./daily-ledger-overview-table";

const ledger: DailyLedgerResponse = {
  workspaceId: "workspace-1",
  from: "2026-09-08",
  to: "2026-09-08",
  members: [{ userId: "u1", displayName: "حمید" }],
  days: [
    {
      date: "2026-09-08",
      weekday: 2,
      isHoliday: false,
      isRangeLocked: false,
      shared: {
        items: [
          {
            expenseId: "e1",
            title: "نان",
            amount: { amountMinor: "100000", currency: "IRR" },
            visibility: "company",
            status: "posted",
          },
        ],
        total: { amountMinor: "100000", currency: "IRR" },
      },
      members: {
        u1: {
          items: [],
          total: { amountMinor: "0", currency: "IRR" },
        },
      },
      dayTotal: { amountMinor: "100000", currency: "IRR" },
      fundDeposits: [
        {
          movementId: "m1",
          fundId: "f1",
          fundName: "صندوق",
          kind: "gift",
          amountMinor: "500000",
          actorUserId: "u1",
          cashInByUserId: "u1",
          occurredOn: "2026-09-08",
          occurredAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    },
  ],
  totals: {
    members: { u1: { amountMinor: "0", currency: "IRR" } },
    shared: { amountMinor: "100000", currency: "IRR" },
    grand: { amountMinor: "100000", currency: "IRR" },
  },
  rangeLocks: [],
  canManageLocks: false,
  source: { expense: "memory", dayMeta: "memory" },
};

describe("DailyLedgerOverviewTable", () => {
  afterEach(cleanup);

  it("opens day detail from جزئیات without inline add buttons", () => {
    const onOpenDay = vi.fn();
    render(
      <DailyLedgerOverviewTable
        ledger={ledger}
        todayIso="2026-09-08"
        pending={false}
        onOpenDay={onOpenDay}
      />,
    );

    expect(screen.queryByRole("button", { name: "+ مشترک" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ کالا" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "جزئیات" })[0]!);
    expect(onOpenDay).toHaveBeenCalledWith("2026-09-08");
  });
});
