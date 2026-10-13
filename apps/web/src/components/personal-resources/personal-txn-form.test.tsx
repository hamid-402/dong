/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PersonalTxnForm } from "./personal-txn-form";

describe("PersonalTxnForm", () => {
  afterEach(() => cleanup());

  it("keeps the short fields visible and the rest closed", () => {
    render(
      <PersonalTxnForm
        displayUnit="toman"
        accountId="acc"
        accounts={[{ id: "acc", name: "نقد" }]}
        kind="expense"
        amount=""
        amountError="مبلغ معتبر وارد کنید"
        note=""
        date="2026-10-13"
        categoryId=""
        categories={[]}
        linkWorkspaceId=""
        linkWorkspaces={[]}
        linkExpenseId=""
        linkExpenses={[]}
        linkSettlementId=""
        linkSettlements={[]}
        pending={false}
        onAccountIdChange={() => undefined}
        onKindChange={() => undefined}
        onAmountChange={() => undefined}
        onNoteChange={() => undefined}
        onDateChange={() => undefined}
        onCategoryIdChange={() => undefined}
        onLinkWorkspaceIdChange={() => undefined}
        onLinkExpenseIdChange={() => undefined}
        onLinkSettlementIdChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByLabelText(/شرح/)).toBeTruthy();
    expect(screen.getByLabelText(/مبلغ/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/مبلغ/);
    expect(screen.getByText("جزئیات تراکنش").closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.queryByText(/پاکت/)).toBeNull();
    expect(screen.queryByText(/قابلیت/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ثبت تراکنش" }));
  });
});
