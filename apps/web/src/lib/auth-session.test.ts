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
    expect(safeAppPath("https://evil.example")).toBe("/home");
    expect(safeAppPath("//evil.example")).toBe("/home");
    expect(safeAppPath("/login?next=/spaces")).toBe("/home");
    expect(safeAppPath(null)).toBe("/home");
  });

  it("accepts only internal paths that start with / and not //", () => {
    expect(safeAppPath("/invite?token=abc")).toBe("/invite?token=abc");
    expect(safeAppPath("/register")).toBe("/home");
    expect(safeAppPath("relative")).toBe("/home");
    expect(safeAppPath("http://evil.example/x")).toBe("/home");
  });
});

