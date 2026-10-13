import { describe, expect, it } from "vitest";
import { NAV_LABELS } from "@/lib/nav-labels";
import { resolveShellLocation } from "@/components/shell/shell-location";

describe("resolveShellLocation", () => {
  it("treats /home as the home section with no back target", () => {
    const loc = resolveShellLocation({ pathname: "/home" });
    expect(loc.section).toBe("home");
    expect(loc.activeTab).toBe("home");
    expect(loc.back).toBeNull();
    expect(loc.primary).toBe(true);
    expect(loc.inWorkspace).toBe(false);
  });

  it("treats list aliases as the spaces section", () => {
    const spaces = resolveShellLocation({ pathname: "/spaces" });
    expect(spaces.section).toBe("spaces");
    expect(spaces.activeTab).toBe("spaces");
    expect(spaces.trail.map((c) => c.label)).toEqual([
      NAV_LABELS.home,
      NAV_LABELS.spacesList,
    ]);
    expect(spaces.back).toEqual({ href: "/home", label: NAV_LABELS.home });

    expect(resolveShellLocation({ pathname: "/groups" }).activeTab).toBe("spaces");
    expect(resolveShellLocation({ pathname: "/home", search: "view=spaces" }).section).toBe(
      "spaces",
    );
    expect(resolveShellLocation({ pathname: "/overview" }).section).toBe("home");
  });

  it("points back at the space list from create-space", () => {
    const loc = resolveShellLocation({ pathname: "/spaces/new" });
    expect(loc.back).toEqual({ href: "/spaces", label: NAV_LABELS.spacesList });
    expect(loc.primary).toBe(false);
  });

  it("skips the domain crumb when choosing the back target", () => {
    const loc = resolveShellLocation({
      pathname: "/w/acme/charts",
      workspaceName: "آکمه",
      template: "friends_family",
    });
    expect(loc.section).toBe("workspace");
    expect(loc.spaceName).toBe("آکمه");
    expect(loc.spaceKind).toBe("group");
    expect(loc.activeDomain).toBe("finance");
    expect(loc.trail.some((c) => c.group && c.label === NAV_LABELS.sectionFinance)).toBe(
      true,
    );
    expect(loc.back).toEqual({ href: "/w/acme", label: "آکمه" });
    expect(loc.isHrefActive("/w/acme/charts")).toBe(true);
    expect(loc.isHrefActive("/home")).toBe(false);
    expect(loc.activeTab).toBeNull();
  });

  it("marks the expense dock tab on the record and expense pages", () => {
    expect(
      resolveShellLocation({ pathname: "/w/acme/record", workspaceName: "آکمه" }).activeTab,
    ).toBe("expenses");
    expect(
      resolveShellLocation({ pathname: "/w/acme/expenses", workspaceName: "آکمه" }).activeTab,
    ).toBe("expenses");
    expect(resolveShellLocation({ pathname: "/account/security" }).activeTab).toBe("more");
  });
});
