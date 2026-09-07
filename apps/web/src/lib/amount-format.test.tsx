/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Amount, formatToman } from "@dang/ui";

describe("Amount + formatToman", () => {
  it("formatToman uses fa-IR digits", () => {
    const s = formatToman(1234567);
    expect(s).toMatch(/[۰-۹]/);
    expect(s).not.toMatch(/[0-9]/);
  });

  it("Amount wraps value with dir=ltr", () => {
    const { container } = render(<Amount toman={1250000} />);
    const span = container.querySelector("span[dir='ltr']");
    expect(span).not.toBeNull();
    expect(span?.getAttribute("dir")).toBe("ltr");
  });
});
