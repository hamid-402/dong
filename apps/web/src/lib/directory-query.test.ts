/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { parseDirectoryQuery } from "./directory-query";

describe("parseDirectoryQuery", () => {
  it("returns plain text as all-scope", () => {
    expect(parseDirectoryQuery("دوستان")).toEqual({
      kind: "all",
      text: "دوستان",
    });
  });

  it("parses Persian kind prefixes", () => {
    expect(parseDirectoryQuery("گ:سفر")).toEqual({
      kind: "spaceKind",
      spaceKind: "group",
      text: "سفر",
    });
    expect(parseDirectoryQuery("س: برج")).toEqual({
      kind: "spaceKind",
      spaceKind: "building",
      text: "برج",
    });
  });

  it("parses spaces/pages scopes", () => {
    expect(parseDirectoryQuery("فضا:من")).toEqual({
      kind: "spaces",
      text: "من",
    });
    expect(parseDirectoryQuery("صفحه:تسویه")).toEqual({
      kind: "pages",
      text: "تسویه",
    });
  });
});
