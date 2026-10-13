/**
 * @vitest-environment jsdom
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmProvider } from "@dang/ui";
import { emptySplitComposer, type SplitComposerValue } from "@/components/split-composer";
import { ExpenseFormPanel } from "./expense-form-panel";

const members = [
  {
    workspaceId: "w",
    userId: "a",
    displayName: "علی",
    role: "owner" as const,
    defaultShares: 1,
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    workspaceId: "w",
    userId: "b",
    displayName: "سارا",
    role: "member" as const,
    defaultShares: 1,
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
];

function Harness({ onCreateExpense }: { onCreateExpense: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [split, setSplit] = useState<SplitComposerValue>(() => {
    const next = emptySplitComposer("shared");
    next.participantUserIds = ["a", "b"];
    next.paidByUserId = "a";
    return next;
  });
  return (
    <ConfirmProvider>
      <ExpenseFormPanel
        title={title}
        onTitleChange={setTitle}
        amountToman={amount}
        onAmountTomanChange={setAmount}
        expenseDate="2026-10-13"
        onExpenseDateChange={() => undefined}
        split={split}
        onSplitChange={setSplit}
        expensePeriodId=""
        onExpensePeriodIdChange={() => undefined}
        periods={[]}
        members={members}
        supportsCompany={false}
        session={null}
        offlineDrafts={[]}
        lastDraftSavedAt={null}
        pending={false}
        onCreateExpense={onCreateExpense}
        onSaveOfflineDraft={() => undefined}
        onSyncOfflineDraft={() => undefined}
        onRemoveOfflineDraft={() => undefined}
      />
    </ConfirmProvider>
  );
}

describe("ExpenseFormPanel short flow", () => {
  afterEach(() => cleanup());

  it("keeps equal split closed and returns an empty description to the field", () => {
    const onCreate = vi.fn();
    render(<Harness onCreateExpense={onCreate} />);
    expect(screen.getByLabelText(/چه کسی پول را داده/)).toBeTruthy();
    expect(screen.getByText(/تقسیم مساوی بین ۲ نفر/)).toBeTruthy();
    expect(screen.getByText("جزئیات تقسیم").closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("جزئیات خرج").closest("details")?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "ثبت خرج" }));
    expect(onCreate).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole("alert").map((node) => node.textContent ?? "");
    expect(alerts.some((text) => text.includes("شرح"))).toBe(true);
    expect(alerts.some((text) => text.includes("مبلغ"))).toBe(true);
  });

  it("accepts Persian digits and submits an equal expense", () => {
    const onCreate = vi.fn();
    render(<Harness onCreateExpense={onCreate} />);
    fireEvent.change(screen.getByLabelText(/شرح/), { target: { value: "ناهار" } });
    fireEvent.change(screen.getByLabelText(/مبلغ/), { target: { value: "۲۵۰۰۰۰" } });
    expect((screen.getByLabelText(/مبلغ/) as HTMLInputElement).value).toBe("250000");
    fireEvent.click(screen.getByRole("button", { name: "ثبت خرج" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
