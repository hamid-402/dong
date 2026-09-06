import { describe, expect, it } from "vitest";
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateRegisterInput,
} from "./auth-validation";

describe("auth-validation", () => {
  it("validateEmail", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("bad")).toMatch(/ایمیل/);
  });

  it("validateDisplayName", () => {
    expect(validateDisplayName("علی")).toBeNull();
    expect(validateDisplayName("")).toMatch(/نام/);
  });

  it("validatePassword", () => {
    expect(validatePassword("StrongPass1")).toBeNull();
    expect(validatePassword("short")).toMatch(/۱۰/);
    expect(validatePassword("onlyletters")).toMatch(/حرف و عدد/);
  });

  it("validateRegisterInput aggregates", () => {
    expect(validateRegisterInput("a@b.co", "StrongPass1", "Ali")).toBeNull();
    expect(validateRegisterInput("a@b.co", "StrongPass1", "")).toMatch(/نام/);
  });
});
