/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DemoConfirmDialog } from "@/components/views/demo-confirm-dialog";

describe("DemoConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses the prompt dialog and confirms only the exact phrase", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DemoConfirmDialog
        title="کاشت دادهٔ نمونهٔ فضا (دمو)"
        confirmExact="SEED_WORKSPACE_DEMO"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog", { name: "کاشت دادهٔ نمونهٔ فضا (دمو)" })).toBeTruthy();
    expect(screen.getByText(/SEED_WORKSPACE_DEMO/)).toBeTruthy();
    const field = screen.getByRole("textbox", { name: /عبارت تأیید/ });
    const confirm = screen.getByRole("button", { name: "تأیید" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: "SEED_WORKSPACE_DEMO" } });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
