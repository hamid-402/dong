import { describe, expect, it } from "vitest";
import { kindTabVisualState } from "./space-kind-header-tabs";

describe("kindTabVisualState", () => {
  it("marks home list-active on /home", () => {
    expect(
      kindTabVisualState({
        tabKey: "home",
        pathname: "/home",
        homeHref: "/home",
        kindQuery: null,
        newKindQuery: null,
        workspaceKind: null,
        onWorkspace: false,
      }),
    ).toBe("list-active");
  });

  it("marks kind list-active on /home?kind=", () => {
    expect(
      kindTabVisualState({
        tabKey: "group",
        pathname: "/home",
        homeHref: "/home",
        kindQuery: "group",
        newKindQuery: "group",
        workspaceKind: null,
        onWorkspace: false,
      }),
    ).toBe("list-active");
  });

  it("keeps home idle when a kind filter is active", () => {
    expect(
      kindTabVisualState({
        tabKey: "home",
        pathname: "/home",
        homeHref: "/home",
        kindQuery: "personal",
        newKindQuery: "personal",
        workspaceKind: null,
        onWorkspace: false,
      }),
    ).toBe("idle");
  });

  it("marks current-realm inside workspace without treating as list page", () => {
    expect(
      kindTabVisualState({
        tabKey: "group",
        pathname: "/w/acme/settlements",
        homeHref: "/home",
        kindQuery: null,
        newKindQuery: null,
        workspaceKind: "group",
        onWorkspace: true,
      }),
    ).toBe("current-realm");
  });

  it("keeps other kinds idle inside a different-realm workspace", () => {
    expect(
      kindTabVisualState({
        tabKey: "org",
        pathname: "/w/acme/members",
        homeHref: "/home",
        kindQuery: null,
        newKindQuery: null,
        workspaceKind: "group",
        onWorkspace: true,
      }),
    ).toBe("idle");
  });
});
