import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toDirectoryEntry } from "../src/workspace-directory.js";

describe("workspace-directory", () => {
  it("maps membership-scoped workspace to directory entry with spaceKind", () => {
    const entry = toDirectoryEntry({
      id: "w1",
      name: "دوستان",
      slug: "friends",
      template: "friends_family",
      timezone: "Asia/Tehran",
      displayUnit: "rial",
      myRole: "member",
    });
    assert.equal(entry.spaceKind, "group");
    assert.equal(entry.myRole, "member");
    assert.equal(entry.myNetMinor, undefined);
  });

  it("keeps optional metrics when provided", () => {
    const entry = toDirectoryEntry({
      id: "w2",
      name: "برج",
      slug: "tower",
      template: "residential_building",
      timezone: "Asia/Tehran",
      displayUnit: "rial",
      myRole: "owner",
      myNetMinor: "-500",
      openSettlements: 1,
    });
    assert.equal(entry.myNetMinor, "-500");
    assert.equal(entry.openSettlements, 1);
  });

  it("maps org and building templates", () => {
    assert.equal(
      toDirectoryEntry({
        id: "o1",
        name: "شرکت",
        slug: "co",
        template: "small_team",
        timezone: "Asia/Tehran",
        displayUnit: "rial",
        myRole: "finance",
      }).spaceKind,
      "org",
    );
    assert.equal(
      toDirectoryEntry({
        id: "b1",
        name: "برج",
        slug: "tower",
        template: "residential_building",
        timezone: "Asia/Tehran",
        displayUnit: "rial",
        myRole: "owner",
      }).spaceKind,
      "building",
    );
  });
});
