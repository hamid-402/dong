/**
 * @vitest-environment jsdom
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromptDialog, PromptProvider, usePrompt } from "@dang/ui";

describe("PromptDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("focuses the field and confirms the typed value with Enter", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PromptDialog
        open
        title="قالب سهم"
        label="نام قالب"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "قالب سهم" });
    const field = screen.getByRole("textbox", { name: /نام قالب/ });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "  سفر شمال  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("سفر شمال");

    const confirm = screen.getByRole("button", { name: "تأیید" });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps a password as typed and requires a value", () => {
    const onConfirm = vi.fn();
    render(
      <PromptDialog
        open
        title="خروجی داده"
        description="برای خروجی داده، رمز فعلی را وارد کنید"
        label="رمز فعلی"
        inputType="password"
        confirmLabel="دریافت خروجی"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const field = screen.getByLabelText(/رمز فعلی/);
    expect(field.getAttribute("type")).toBe("password");
    expect(field.getAttribute("dir")).toBe("ltr");
    const confirm = screen.getByRole("button", { name: "دریافت خروجی" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: " secret " } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(" secret ");
  });

  it("accepts a typed confirmation only when the phrase matches", () => {
    const onConfirm = vi.fn();
    render(
      <PromptDialog
        open
        title="حذف حساب"
        label="عبارت تأیید"
        confirmExact="DELETE"
        confirmLabel="ادامه"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText(/DELETE/)).toBeTruthy();
    const field = screen.getByRole("textbox", { name: /عبارت تأیید/ });
    const confirm = screen.getByRole("button", { name: "ادامه" });
    fireEvent.change(field, { target: { value: "delete" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("نادرست");
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "DELETE" } });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("DELETE");
  });

  it("allows an empty optional note", () => {
    const onConfirm = vi.fn();
    render(
      <PromptDialog
        open
        title="پذیرش اعتراض"
        label="توضیح"
        required={false}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "تأیید" }));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("renders nothing while closed", () => {
    render(
      <PromptDialog
        open={false}
        title="نام"
        label="نام"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

function PromptHarness() {
  const prompt = usePrompt();
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void prompt({
            title: "تغییر نام دسته",
            label: "نام دسته",
            defaultValue: "خوراک",
            confirmLabel: "ذخیره",
          }).then(setValue);
        }}
      >
        باز کردن
      </button>
      <p data-testid="result">{value ?? ""}</p>
    </>
  );
}

describe("usePrompt", () => {
  afterEach(() => {
    cleanup();
  });

  it("resolves the entered text and null on cancel", async () => {
    render(
      <PromptProvider>
        <PromptHarness />
      </PromptProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "باز کردن" }));
    const field = screen.getByRole("textbox", { name: /نام دسته/ });
    expect((field as HTMLInputElement).value).toBe("خوراک");
    fireEvent.change(field, { target: { value: "رفت‌وآمد" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => {
      expect(screen.getByTestId("result").textContent).toBe("رفت‌وآمد");
    });

    fireEvent.click(screen.getByRole("button", { name: "باز کردن" }));
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    await waitFor(() => {
      expect(screen.getByTestId("result").textContent).toBe("");
    });
  });
});
