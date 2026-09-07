import { describe, expect, it } from "vitest";
import { hubPathFor } from "@/lib/hub-links";

describe("hubPathFor", () => {
  it("returns classic product paths (not opaque hub URLs)", () => {
    expect(hubPathFor("/workspaces")).toBe("/workspaces");
    expect(hubPathFor("/workspaces/invite")).toBe("/workspaces/invite");
    expect(hubPathFor("/groups")).toBe("/group");
    expect(hubPathFor("/me/")).toBe("/me");
  });
});
