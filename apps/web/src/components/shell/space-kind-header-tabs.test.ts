import { describe, expect, it } from "vitest";
import { kindTabVisualState, sectionTabActive, spaceHomeTabActive } from "./space-kind-header-tabs";

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

  it("marks a classic space-list alias through the canonical map", () => {
    expect(
      kindTabVisualState({
        tabKey: "group",
        pathname: "/groups",
        homeHref: "/home",
        kindQuery: "group",
        newKindQuery: null,
        workspaceKind: null,
        onWorkspace: false,
      }),
    ).toBe("list-active");
    expect(
      kindTabVisualState({
        tabKey: "building",
        pathname: "/workspaces",
        homeHref: "/home",
        kindQuery: "building",
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

  it("marks the domain tab for the open page or folder", () => {
    expect(
      sectionTabActive({ sectionKey: "finance", activeDomain: "finance", folder: null }),
    ).toBe(true);
    expect(
      sectionTabActive({ sectionKey: "buy", activeDomain: null, folder: "buy" }),
    ).toBe(true);
    expect(
      sectionTabActive({ sectionKey: "people", activeDomain: "finance", folder: null }),
    ).toBe(false);
  });

  it("marks space home only on the workspace root", () => {
    expect(
      spaceHomeTabActive({
        pathname: "/w/acme",
        slug: "acme",
        activeDomain: null,
        folder: null,
      }),
    ).toBe(true);
    expect(
      spaceHomeTabActive({
        pathname: "/w/acme/charts",
        slug: "acme",
        activeDomain: "finance",
        folder: null,
      }),
    ).toBe(false);
    expect(
      spaceHomeTabActive({
        pathname: "/w/acme",
        slug: "acme",
        activeDomain: null,
        folder: "finance",
      }),
    ).toBe(false);
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
