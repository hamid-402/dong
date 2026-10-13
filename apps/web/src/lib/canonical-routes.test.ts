import { describe, expect, it } from "vitest";
import {
  absoluteForPage,
  classicPathToWorkspacePage,
  homeListAlias,
} from "@/lib/workspace-paths";

describe("canonical route redirects", () => {
  it("sends home aliases to /home", () => {
    expect(classicPathToWorkspacePage("/overview")).toBe("home");
    expect(classicPathToWorkspacePage("/")).toBe("home");
    expect(absoluteForPage("home", "acme")).toBe("/home");
    expect(homeListAlias("")).toBeNull();
  });

  it("sends the space list aliases to /spaces and keeps kind", () => {
    expect(classicPathToWorkspacePage("/groups")).toBe("spaces");
    expect(classicPathToWorkspacePage("/workspaces")).toBe("spaces");
    expect(absoluteForPage("spaces", null)).toBe("/spaces");
    expect(homeListAlias("view=spaces")).toBe("/spaces");
    expect(homeListAlias("?view=spaces&kind=building")).toBe("/spaces?kind=building");
    expect(homeListAlias("kind=org")).toBe("/spaces?kind=org");
  });

  it("keeps a space and finance bookmarks on /w/[slug]", () => {
    expect(classicPathToWorkspacePage("/group")).toBe("space");
    expect(absoluteForPage("space", "acme")).toBe("/w/acme/space");
    expect(classicPathToWorkspacePage("/workspaces", "#settlement-panel")).toBe(
      "settlements",
    );
    expect(classicPathToWorkspacePage("/workspaces/procurement")).toBe("procurement");
    expect(absoluteForPage("procurement", "acme")).toBe("/w/acme/procurement");
    expect(classicPathToWorkspacePage("/workspaces", "#unknown")).toBe("expenses");
  });
});
