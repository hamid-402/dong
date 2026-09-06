import { describe, expect, it } from "vitest";
import {
  buildHubPath,
  keyToPathSegment,
  parseHubLocation,
  pathSegmentToKey,
  routeToHubContentPath,
} from "./hub-nav-url";

describe("hub-nav-url", () => {
  it("encodes and decodes route segments", () => {
    expect(keyToPathSegment("/workspaces/invite")).toBe("~workspaces--invite");
    expect(pathSegmentToKey("~workspaces--invite")).toBe("/workspaces/invite");
  });

  it("builds and parses hub paths", () => {
    expect(buildHubPath([])).toBe("/hub");
    expect(buildHubPath([{ key: "finance" }], "/workspaces")).toBe(
      "/hub/finance/~workspaces",
    );
    const parsed = parseHubLocation("finance/~workspaces");
    expect(parsed.groupKeys).toEqual(["finance"]);
    expect(parsed.contentRoute).toBe("/workspaces");
  });

  it("maps classic routes into hub content paths", () => {
    const tree = [
      {
        key: "finance",
        isGroup: true,
        children: [{ key: "ws", route: "/workspaces" }],
      },
      {
        key: "spaces",
        isGroup: true,
        children: [
          { key: "me", route: "/me" },
          { key: "group", route: "/group" },
        ],
      },
    ];
    expect(routeToHubContentPath("/workspaces", tree)).toBe(
      "/hub/finance/~workspaces",
    );
    expect(routeToHubContentPath("/groups", tree)).toBe("/hub/spaces/~group");
    expect(routeToHubContentPath("/", tree)).toBe("/hub");
  });
});
