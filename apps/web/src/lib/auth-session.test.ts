import { describe, expect, it } from "vitest";
import { safeAppPath } from "@/lib/auth-session";
import { normalizeEmail, validateEmail } from "@/lib/auth-validation";

describe("auth helpers", () => {
  it("normalizes email for login/register", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(validateEmail("  User@Example.COM ")).toBeNull();
  });

  it("blocks open redirects after login", () => {
    expect(safeAppPath("/spaces")).toBe("/spaces");
    expect(safeAppPath("/w/demo/expenses")).toBe("/w/demo/expenses");
    expect(safeAppPath("https://evil.example")).toBe("/spaces");
    expect(safeAppPath("//evil.example")).toBe("/spaces");
    expect(safeAppPath("/login?next=/spaces")).toBe("/spaces");
    expect(safeAppPath(null)).toBe("/spaces");
  });
});
