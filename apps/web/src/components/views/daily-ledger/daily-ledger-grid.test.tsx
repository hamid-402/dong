/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DailyLedgerResponse } from "@dang/contracts";
import { DailyLedgerGrid } from "./daily-ledger-grid";

const ledger: DailyLedgerResponse = {
  workspaceId: "workspace-1",
  from: "2026-09-08",
  to: "2026-09-08",
  members: [],
  days: [
    {
      date: "2026-09-08",
      weekday: 2,
      isHoliday: false,
      isRangeLocked: false,
      shared: {
        items: [],
        total: { amountMinor: "0", currency: "IRR" },
      },
      members: {},
      dayTotal: { amountMinor: "0", currency: "IRR" },
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

describe("DailyLedgerGrid inspector access", () => {
  afterEach(cleanup);

  it("keeps day detail inspection available in read-only mode", () => {
    const onSelectDay = vi.fn();
    render(
      <DailyLedgerGrid
        ledger={ledger}
        viewMode="cards"
        showGregorian={false}
        todayIso="2026-09-08"
        pending={false}
        readOnly
        selectedDate={null}
        onSelectDay={onSelectDay}
        onOpenDraft={vi.fn()}
        onDeleteItem={vi.fn()}
        onToggleHoliday={vi.fn()}
        onEditNote={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "جزئیات" }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-09-08");
    expect(screen.queryByRole("button", { name: "+ مشترک" })).toBeNull();
  });
});
