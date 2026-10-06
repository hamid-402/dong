/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DailyLedgerDayRow, DailyLedgerResponse } from "@dang/contracts";
import { DailyLedgerDayView } from "./daily-ledger-day-view";

vi.mock("@/components/views/daily-ledger/daily-tick-panel", () => ({
  DailyTickPanel: () => null,
}));

const day: DailyLedgerDayRow = {
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
        fundingSourceKind: "personal",
      },
    ],
    total: { amountMinor: "100000", currency: "IRR" },
  },
  members: {},
  dayTotal: { amountMinor: "100000", currency: "IRR" },
  fundDeposits: [],
};

const ledger: DailyLedgerResponse = {
  workspaceId: "workspace-1",
  from: "2026-09-08",
  to: "2026-09-08",
  members: [
    { userId: "u1", displayName: "علی" },
    { userId: "u2", displayName: "سارا" },
  ],
  days: [day],
  totals: {
    members: {},
    shared: { amountMinor: "100000", currency: "IRR" },
    grand: { amountMinor: "100000", currency: "IRR" },
  },
  rangeLocks: [],
  canManageLocks: false,
  source: { expense: "memory", dayMeta: "memory" },
};

describe("DailyLedgerDayView", () => {
  afterEach(cleanup);

  it("returns to range overview via back control", () => {
    const onBack = vi.fn();
    render(
      <DailyLedgerDayView
        workspaceId="workspace-1"
        ledger={ledger}
        day={day}
        members={[]}
        catalogEnabled={false}
        onBack={onBack}
        onOpenDraft={vi.fn()}
        onDeleteItem={vi.fn()}
        onEditNote={vi.fn()}
        onToggleHoliday={vi.fn()}
        onPosted={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getAllByText("نان").length).toBeGreaterThan(0);
    expect(screen.getByRole("toolbar", { name: "عملیات ردیف‌های انتخاب‌شده" })).toBeTruthy();
    expect(screen.getAllByLabelText("انتخاب نان").length).toBeGreaterThan(0);
    expect(screen.getAllByText("۱").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "بازگشت به خلاصه بازه" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("enables edit/delete in selection toolbar after row checkbox", () => {
    const onOpenDraft = vi.fn();
    const onDeleteItem = vi.fn();
    render(
      <DailyLedgerDayView
        workspaceId="workspace-1"
        ledger={ledger}
        day={day}
        members={[]}
        catalogEnabled={false}
        onBack={vi.fn()}
        onOpenDraft={onOpenDraft}
        onDeleteItem={onDeleteItem}
        onEditNote={vi.fn()}
        onToggleHoliday={vi.fn()}
        onPosted={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const edit = screen.getByRole("button", { name: "ویرایش" });
    const del = screen.getByRole("button", { name: "حذف" });
    expect(edit).toBeDisabled();
    expect(del).toBeDisabled();
    fireEvent.click(screen.getAllByLabelText("انتخاب نان")[0]!);
    expect(edit).not.toBeDisabled();
    expect(del).not.toBeDisabled();
    fireEvent.click(edit);
    expect(onOpenDraft).toHaveBeenCalled();
  });

  it("exposes day-before / day-after when neighbors provided", () => {
    const onGoDate = vi.fn();
    render(
      <DailyLedgerDayView
        workspaceId="workspace-1"
        ledger={ledger}
        day={day}
        members={[]}
        catalogEnabled={false}
        prevDay={{ date: "2026-09-07", weekday: 1 }}
        nextDay={{ date: "2026-09-09", weekday: 3 }}
        onBack={vi.fn()}
        onGoDate={onGoDate}
        onOpenDraft={vi.fn()}
        onDeleteItem={vi.fn()}
        onEditNote={vi.fn()}
        onToggleHoliday={vi.fn()}
        onPosted={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /روز قبل/ }));
    expect(onGoDate).toHaveBeenCalledWith("2026-09-07");
    fireEvent.click(screen.getByRole("button", { name: /روز بعد/ }));
    expect(onGoDate).toHaveBeenCalledWith("2026-09-09");
  });

  it("lets the user pick a member for individual lines", () => {
    const onOpenDraft = vi.fn();
    render(
      <DailyLedgerDayView
        workspaceId="workspace-1"
        ledger={ledger}
        day={day}
        members={ledger.members}
        catalogEnabled={false}
        preferMemberUserId="u2"
        onBack={vi.fn()}
        onOpenDraft={onOpenDraft}
        onDeleteItem={vi.fn()}
        onEditNote={vi.fn()}
        onToggleHoliday={vi.fn()}
        onPosted={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ فردی" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /سارا/ }));
    expect(onOpenDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "member",
        userId: "u2",
        displayName: "سارا",
        date: "2026-09-08",
      }),
    );
  });

  it("shows read-only related full expenses for the day", () => {
    const dayWithRelated: DailyLedgerDayRow = {
      ...day,
      relatedExpenses: [
        {
          id: "exp-full-1",
          title: "رستوران جمعه",
          amount: { amountMinor: "900000", currency: "IRR" },
          status: "posted",
          visibility: "shared",
        },
      ],
    };
    render(
      <DailyLedgerDayView
        workspaceId="workspace-1"
        ledger={{ ...ledger, days: [dayWithRelated] }}
        day={dayWithRelated}
        members={[]}
        catalogEnabled={false}
        expensesHref="/w/demo/expenses"
        onBack={vi.fn()}
        onOpenDraft={vi.fn()}
        onDeleteItem={vi.fn()}
        onEditNote={vi.fn()}
        onToggleHoliday={vi.fn()}
        onPosted={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByText("رستوران جمعه")).toBeTruthy();
    expect(screen.getByRole("link", { name: /رستوران جمعه/ })).toHaveAttribute(
      "href",
      "/w/demo/expenses?expense=exp-full-1",
    );
  });
});
