/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "@dang/ui";

describe("PasswordInput", () => {
  afterEach(() => {
    cleanup();
  });
  it("hides the password until the toggle is pressed", () => {
    render(<PasswordInput label="رمز عبور" autoComplete="current-password" />);
    const input = screen.getByLabelText("رمز عبور");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("dir", "ltr");

    const show = screen.getByRole("button", { name: "نمایش" });
    expect(show).toHaveAttribute("aria-pressed", "false");
    expect(show).toHaveAttribute("aria-controls", input.id);

    fireEvent.click(show);
    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "پنهان" });
    expect(hide).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(hide);
    expect(input).toHaveAttribute("type", "password");
  });

  it("exposes the error as an alert and marks the field required", () => {
    render(<PasswordInput label="رمز عبور" error="رمز کوتاه است" required />);
    const input = screen.getByLabelText(/رمز عبور/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(screen.getByRole("alert")).toHaveTextContent("رمز کوتاه است");
    expect(screen.getByText("الزامی")).toBeTruthy();
  });
});
