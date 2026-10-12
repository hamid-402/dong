import { describe, expect, it } from "vitest";
import {
  dangerZoneActions,
  slugConfirmState,
  leaveConsequences,
} from "./workspace-danger-zone-actions";

describe("workspace danger zone actions", () => {
  it("personal template hides all destructive actions", () => {
    const next = dangerZoneActions({
      template: "personal",
      role: "owner",
      archived: false,
    });
    expect(next.personalProtected).toBe(true);
    expect(next.showLeave).toBe(false);
    expect(next.showOwnerLifecycle).toBe(false);
  });

  it("member sees leave; owner sees archive/delete", () => {
    expect(
      dangerZoneActions({ template: "friends_family", role: "member", archived: false }),
    ).toEqual({
      personalProtected: false,
      showLeave: true,
      showOwnerLifecycle: false,
      showUnarchive: false,
    });
    expect(
      dangerZoneActions({ template: "small_team", role: "owner", archived: true }),
    ).toEqual({
      personalProtected: false,
      showLeave: false,
      showOwnerLifecycle: true,
      showUnarchive: true,
    });
  });

  it("slug confirm states", () => {
    expect(slugConfirmState("", "trip")).toBe("empty");
    expect(slugConfirmState("tri", "trip")).toBe("mismatch");
    expect(slugConfirmState("TRIP", "trip")).toBe("match");
  });

  it("leave consequences are non-empty keep/lose", () => {
    const c = leaveConsequences();
    expect(c.keep.length).toBeGreaterThanOrEqual(1);
    expect(c.lose.length).toBeGreaterThanOrEqual(1);
  });
});
