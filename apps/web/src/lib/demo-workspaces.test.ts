import { describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "@dang/contracts";
import {
  filterVisibleWorkspaces,
  isHiddenDemoWorkspace,
  isRawDemoSlug,
} from "@/lib/demo-workspaces";

function workspace(
  slug: string,
  name: string,
  template: WorkspaceSummary["template"] = "friends_family",
): WorkspaceSummary {
  return {
    id: slug,
    name,
    slug,
    template,
    timezone: "Asia/Tehran",
    displayUnit: "rial",
  };
}

describe("isHiddenDemoWorkspace", () => {
  it("hides the Aftab demo even when the name has no دمو label", () => {
    expect(isHiddenDemoWorkspace(workspace("demo-aftab-local", "پروژه آفتاب", "project_partners"))).toBe(
      true,
    );
    expect(
      isHiddenDemoWorkspace(workspace("demo-aftab-user", "پروژه آفتاب (دمو · پاک‌شده)", "project_partners")),
    ).toBe(true);
  });

  it("keeps a real workspace whose name is a single latin word", () => {
    const vidaverse = workspace("vidaverse", "vidaverse");
    expect(isHiddenDemoWorkspace(vidaverse)).toBe(false);
    expect(filterVisibleWorkspaces([vidaverse, workspace("demo-aftab-x", "پروژه آفتاب")])).toEqual([
      vidaverse,
    ]);
  });

  it("keeps the active colleagues demo and hides purged or fixture slugs", () => {
    expect(
      isHiddenDemoWorkspace(workspace("demo-colleagues-local", "گروه همکاران (دمو)", "small_team")),
    ).toBe(false);
    expect(isHiddenDemoWorkspace(workspace("team-trip", "سفر پاک‌شده"))).toBe(true);
    expect(isHiddenDemoWorkspace(workspace("friends-test-1", "آزمایش"))).toBe(true);
    expect(isHiddenDemoWorkspace(workspace("friends-ali", "علی"))).toBe(false);
  });
});

describe("isRawDemoSlug", () => {
  it("matches generated demo slugs and not real names", () => {
    expect(isRawDemoSlug("demo-aftab-local")).toBe(true);
    expect(isRawDemoSlug("demo-colleagues-local")).toBe(true);
    expect(isRawDemoSlug("friends-proxy-9")).toBe(true);
    expect(isRawDemoSlug("vidaverse")).toBe(false);
    expect(isRawDemoSlug("پروژه آفتاب")).toBe(false);
  });
});
