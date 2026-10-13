import { describe, expect, it } from "vitest";
import { workspaceDisplayName } from "@/lib/workspace-display-name";

describe("workspaceDisplayName", () => {
  it("keeps Persian names", () => {
    expect(workspaceDisplayName("شرکت آتیه", "small_team")).toBe("شرکت آتیه");
  });

  it("keeps a single-token name", () => {
    expect(workspaceDisplayName("vidaverse", "friends_family")).toBe("vidaverse");
  });

  it("keeps a real multi-word name even in latin letters", () => {
    expect(workspaceDisplayName("QA Group Test", "friends_family")).toBe("QA Group Test");
  });

  it("replaces a raw demo slug with the kind label", () => {
    expect(workspaceDisplayName("demo-aftab-local", "project_partners")).toBe("سازمان");
    expect(workspaceDisplayName("vidaverse", "project_partners")).toBe("vidaverse");
  });

  it("falls back when empty", () => {
    expect(workspaceDisplayName("", "residential_building")).toBe("ساختمان");
    expect(workspaceDisplayName(null, null)).toBe("فضا");
  });
});
