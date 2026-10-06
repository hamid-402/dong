/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  filterLivePinnedWorkspaces,
  isWorkspacePinned,
  listPinnedWorkspaces,
  listRecentWorkspaces,
  rememberWorkspaceVisit,
  togglePinnedWorkspace,
} from "./workspace-directory-prefs";

afterEach(() => {
  localStorage.clear();
});

describe("workspace-directory-prefs", () => {
  it("pins and unpins workspaces with a hard cap", () => {
    expect(listPinnedWorkspaces()).toEqual([]);
    togglePinnedWorkspace("a");
    expect(isWorkspacePinned("a")).toBe(true);
    for (let i = 0; i < 10; i++) togglePinnedWorkspace(`w${i}`);
    expect(listPinnedWorkspaces().length).toBeLessThanOrEqual(8);
    const stillPinned = listPinnedWorkspaces()[0];
    expect(stillPinned).toBeTruthy();
    togglePinnedWorkspace(stillPinned!.workspaceId);
    expect(isWorkspacePinned(stillPinned!.workspaceId)).toBe(false);
  });

  it("records recent visits newest-first", () => {
    rememberWorkspaceVisit("x");
    rememberWorkspaceVisit("y");
    rememberWorkspaceVisit("x");
    const recent = listRecentWorkspaces();
    expect(recent[0]?.workspaceId).toBe("x");
    expect(recent[0]?.visitCount).toBe(2);
    expect(recent.some((r) => r.workspaceId === "y")).toBe(true);
  });

  it("filters pins to live membership ids", () => {
    togglePinnedWorkspace("gone");
    togglePinnedWorkspace("live");
    const kept = filterLivePinnedWorkspaces(listPinnedWorkspaces(), ["live"]);
    expect(kept.map((p) => p.workspaceId)).toEqual(["live"]);
  });
});
