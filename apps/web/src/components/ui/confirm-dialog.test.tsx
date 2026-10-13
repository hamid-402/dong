/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "@dang/ui";

describe("ConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });
  it("states the action and confirms or cancels", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="حذف خرج"
        description="این خرج برای همیشه حذف شود؟"
        confirmLabel="حذف"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("dialog", { name: "حذف خرج" })).toBeTruthy();
    expect(screen.getByText("این خرج برای همیشه حذف شود؟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("closes on Escape and keeps Tab inside the dialog", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="ابطال"
        description="این قلم ابطال شود؟"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: "انصراف" });
    const confirm = screen.getByRole("button", { name: "تأیید" });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="حذف"
        description="حذف شود؟"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
