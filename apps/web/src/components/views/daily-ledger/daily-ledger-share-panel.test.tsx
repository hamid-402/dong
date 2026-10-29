/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DailyLedgerDayRow, DailyLedgerMemberColumn } from "@dang/contracts";
import { DailyLedgerSharePanel } from "./daily-ledger-share-panel";

const members: DailyLedgerMemberColumn[] = [
  { userId: "u1", displayName: "مهدی" },
  { userId: "u2", displayName: "داوود" },
];

const day: DailyLedgerDayRow = {
  date: "2026-09-24",
  weekday: 3,
  isHoliday: false,
  isRangeLocked: false,
  shared: {
    items: [
      {
        expenseId: "s1",
        title: "پنیر",
        amount: { amountMinor: "1000000", currency: "IRR" },
        visibility: "company",
        status: "posted",
      },
    ],
    total: { amountMinor: "1000000", currency: "IRR" },
  },
  members: {
    u1: {
      items: [
        {
          expenseId: "p1",
          title: "بیسکویت",
          amount: { amountMinor: "50000", currency: "IRR" },
          visibility: "shared",
          status: "posted",
        },
      ],
      total: { amountMinor: "50000", currency: "IRR" },
    },
    u2: {
      items: [],
      total: { amountMinor: "0", currency: "IRR" },
    },
  },
  dayTotal: { amountMinor: "1050000", currency: "IRR" },
  fundDeposits: [
    {
      movementId: "m1",
      fundId: "f1",
      fundName: "تنخواه اصلی گروه",
      kind: "topup",
      amountMinor: "450000",
      actorUserId: "u1",
      cashInByUserId: "u1",
      occurredOn: "2026-09-24",
      occurredAt: "2026-09-24T12:00:00.000Z",
    },
  ],
};

describe("DailyLedgerSharePanel", () => {
  afterEach(cleanup);

  it("keeps the member list compact and shows detail for the selected person", () => {
    render(<DailyLedgerSharePanel day={day} members={members} />);

    expect(screen.getByRole("button", { name: /مهدی/ })).toBeTruthy();
    expect(screen.getByLabelText("جزئیات سهم مهدی")).toBeTruthy();
    expect(screen.getByText("سهم نهایی")).toBeTruthy();

    const depositFold = screen
      .getByLabelText("باز و بسته کردن جزئیات واریز")
      .closest("details");
    expect(depositFold?.open).toBe(false);

    fireEvent.click(screen.getByLabelText("باز و بسته کردن جزئیات واریز"));
    expect(depositFold?.open).toBe(true);
    expect(screen.getByText("تنخواه اصلی گروه")).toBeTruthy();

    const itemsFold = screen.getByText("اقلام فردی").closest("details");
    expect(itemsFold?.open).toBe(false);
    fireEvent.click(screen.getByText("اقلام فردی"));
    expect(itemsFold?.open).toBe(true);
    expect(screen.getByText("بیسکویت")).toBeTruthy();
  });

  it("run28-a11y-listbox: member picker uses list/button semantics, not listbox/option", () => {
    const { container } = render(
      <DailyLedgerSharePanel day={day} members={members} />,
    );

    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.querySelector('[role="option"]')).toBeNull();

    const list = screen.getByRole("list", { name: "اعضا برای سهم مصرف" });
    expect(list.tagName).toBe("UL");
    expect(list.querySelectorAll(":scope > li").length).toBe(2);

    const mehdi = screen.getByRole("button", { name: /مهدی/ });
    expect(mehdi.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /داوود/ }));
    expect(screen.getByLabelText("جزئیات سهم داوود")).toBeTruthy();
    expect(screen.getByRole("button", { name: /داوود/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: /مهدی/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("run28-formula-dl: formula has no dl>details child; deposit fold stays readable", () => {
    const { container } = render(
      <DailyLedgerSharePanel day={day} members={members} />,
    );

    const formula = screen.getByLabelText("فرمول سهم");
    expect(formula.querySelector(":scope > details")).toBeTruthy();
    for (const dl of formula.querySelectorAll("dl")) {
      expect(dl.querySelector(":scope > details")).toBeNull();
    }
    expect(screen.getByText("مصرف")).toBeTruthy();
    expect(screen.getByText("سهم نهایی")).toBeTruthy();
    expect(
      screen.getByLabelText("باز و بسته کردن جزئیات واریز"),
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText("باز و بسته کردن جزئیات واریز"));
    expect(screen.getByText("تنخواه اصلی گروه")).toBeTruthy();
    expect(container.querySelector('[aria-label="فرمول سهم"]')).toBeTruthy();
  });

  it("run28-persian-digits: displayed amounts use Persian digits (stored minor stays Latin)", () => {
    render(<DailyLedgerSharePanel day={day} members={members} />);

    const hero = screen.getByLabelText("جزئیات سهم مهدی");
    // 50_000 personal + 1_000_000/2 shared − 450_000 deposit → Latin minor in data
    expect(hero.textContent ?? "").toMatch(/[۰-۹]/);
    expect(hero.textContent ?? "").not.toMatch(/\d{3,}/);
  });

  it("shows empty deposit message when member has no credit deposit", () => {
    render(<DailyLedgerSharePanel day={day} members={members} preferUserId="u2" />);

    const depositFold = screen
      .getByLabelText("باز و بسته کردن جزئیات واریز")
      .closest("details");
    expect(depositFold?.open).toBe(false);
    fireEvent.click(screen.getByLabelText("باز و بسته کردن جزئیات واریز"));
    expect(depositFold?.open).toBe(true);
    expect(
      screen.getByText("برای این عضو امروز واریز اعتباری ثبت نشده است."),
    ).toBeTruthy();
  });

  it("collapses drawers again when switching members", () => {
    render(<DailyLedgerSharePanel day={day} members={members} />);
    fireEvent.click(screen.getByLabelText("باز و بسته کردن جزئیات واریز"));
    fireEvent.click(screen.getByText("اقلام فردی"));
    expect(
      screen.getByLabelText("باز و بسته کردن جزئیات واریز").closest("details")?.open,
    ).toBe(true);
    expect(screen.getByText("اقلام فردی").closest("details")?.open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /داوود/ }));
    fireEvent.click(screen.getByRole("button", { name: /مهدی/ }));
    expect(
      screen.getByLabelText("باز و بسته کردن جزئیات واریز").closest("details")?.open,
    ).toBe(false);
    expect(screen.getByText("اقلام فردی").closest("details")?.open).toBe(false);
  });

  it("honors preferUserId for initial selection", () => {
    render(
      <DailyLedgerSharePanel day={day} members={members} preferUserId="u2" />,
    );
    expect(screen.getByLabelText("جزئیات سهم داوود")).toBeTruthy();
  });
});
