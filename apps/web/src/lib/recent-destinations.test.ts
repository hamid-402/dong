/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  listRecentDestinations,
  rememberDestination,
  topUsedDestinations,
} from "./recent-destinations";

describe("recent-destinations frequency", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("increments visitCount on repeat navigation", () => {
    rememberDestination({ key: "a", label: "A", href: "/a" });
    rememberDestination({ key: "a", label: "A", href: "/a" });
    rememberDestination({ key: "b", label: "B", href: "/b" });
    const top = topUsedDestinations(2);
    expect(top[0]?.href).toBe("/a");
    expect(top[0]?.visitCount).toBe(2);
    expect(top[1]?.href).toBe("/b");
  });

  it("filters by live hrefs", () => {
    rememberDestination({ key: "a", label: "A", href: "/a" });
    rememberDestination({ key: "gone", label: "G", href: "/gone" });
    expect(topUsedDestinations(5, { liveHrefs: ["/a"] }).map((r) => r.href)).toEqual([
      "/a",
    ]);
  });

  it("listRecentDestinations prefers newest", () => {
    rememberDestination({ key: "old", label: "O", href: "/old" });
    rememberDestination({ key: "new", label: "N", href: "/new" });
    expect(listRecentDestinations(1)[0]?.href).toBe("/new");
  });
});
