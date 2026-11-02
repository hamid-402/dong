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

function Harness({
  onCreateExpense,
  onAmountTomanChange,
}: {
  onCreateExpense: (amountToman: string) => void;
  onAmountTomanChange?: (amountToman: string) => void;
}) {
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
        onAmountTomanChange={(next) => {
          setAmount(next);
          onAmountTomanChange?.(next);
        }}
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
        onCreateExpense={() => onCreateExpense(amount)}
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

  it("run29b-persian-display-latin-callback: display Persian; onValueChange + submit Latin", () => {
    const onCreate = vi.fn();
    const onAmount = vi.fn();
    render(<Harness onCreateExpense={onCreate} onAmountTomanChange={onAmount} />);
    fireEvent.change(screen.getByLabelText(/شرح/), { target: { value: "ناهار" } });
    fireEvent.change(screen.getByLabelText(/مبلغ/), { target: { value: "۲۵۰۰۰۰" } });

    const amountInput = screen.getByLabelText(/مبلغ/) as HTMLInputElement;
    // 1) visible field uses Persian digit glyphs
    expect(amountInput.value).toMatch(/[۰-۹]/);
    expect(amountInput.value).toBe("۲۵۰۰۰۰");
    // 2) callback / form state stays Latin digits
    expect(onAmount).toHaveBeenCalledWith("250000");
    expect(onAmount.mock.calls.at(-1)?.[0]).toMatch(/^\d+$/);
    expect(onAmount.mock.calls.at(-1)?.[0]).not.toMatch(/[۰-۹]/);

    fireEvent.click(screen.getByRole("button", { name: "ثبت خرج" }));
    // 3) create/submit payload amount is Latin
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledWith("250000");
  });
});
