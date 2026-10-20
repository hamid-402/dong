/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  Amount,
  DisplayUnitProvider,
  formatMoneyFromIrrMinor,
  formatToman,
} from "@dang/ui";

describe("Amount + money format (S11-05)", () => {
  it("formatToman uses fa-IR digits (legacy)", () => {
    const s = formatToman(1234567);
    expect(s).toMatch(/[۰-۹]/);
    expect(s).not.toMatch(/[0-9]/);
  });

  it("formatMoneyFromIrrMinor defaults to rial scale", () => {
    expect(formatMoneyFromIrrMinor(10, "rial")).toBe(formatMoneyFromIrrMinor(10, "rial"));
    expect(formatMoneyFromIrrMinor(10, "toman")).toBe(formatToman(1));
  });

  it("Amount unit is full contrast, Persian, and tabular", () => {
    const { container } = render(
      <Amount irrMinor={1_250_000} displayUnit="rial" />,
    );
    const amount = container.querySelector(".dang-amount");
    const unit = container.querySelector(".dang-amount__unit");
    expect(amount).not.toBeNull();
    expect(amount?.getAttribute("dir")).toBe("ltr");
    expect(amount?.textContent ?? "").toMatch(/[۰-۹]/);
    expect(unit?.textContent).toBe("ریال");
    expect(unit?.getAttribute("style") ?? "").not.toMatch(/opacity/);
  });

  it("Amount follows DisplayUnitProvider when displayUnit omitted", () => {
    const { container } = render(
      <DisplayUnitProvider unit="toman">
        <Amount irrMinor={10} />
      </DisplayUnitProvider>,
    );
    expect(container.textContent ?? "").toMatch(/تومان/);
  });

  it("Amount can still show toman when asked", () => {
    const { container } = render(<Amount irrMinor={10} displayUnit="toman" />);
    expect(container.textContent ?? "").toMatch(/تومان/);
  });
});
