import { describe, expect, it } from "vitest";
import { inviteReturnPath } from "./invite-accept-view";
import { safeAppPath } from "@/lib/auth-session";

describe("inviteReturnPath", () => {
  it("builds an internal next path for login/register with the invite token", () => {
    const path = inviteReturnPath("tok-abc");
    expect(path).toBe("/invite?token=tok-abc");
    expect(safeAppPath(path)).toBe(path);
    expect(path.startsWith("/")).toBe(true);
    expect(path.startsWith("//")).toBe(false);
  });

  it("omits token query when empty", () => {
    expect(inviteReturnPath("")).toBe("/invite");
    expect(inviteReturnPath("  ")).toBe("/invite");
  });
});
