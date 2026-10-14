/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NAV_LABELS } from "@/lib/nav-labels";
import { ShellWorkspaceNavMenu } from "@/components/shell/shell-secondary-rail";
import { ShellPageTrail } from "@/components/shell/shell-page-trail";
import { WorkspaceSectionTabs } from "@/components/shell/space-kind-header-tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/w/acme/charts",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

describe("workspace section tabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks the open domain and keeps every section destination", () => {
    render(
      <WorkspaceSectionTabs
        template="friends_family"
        slug="acme"
        pathname="/w/acme/charts"
        folder={null}
        activeDomain="finance"
        isHrefActive={(href) => href === "/w/acme/expenses"}
      />,
    );

    const finance = screen.getByRole("link", { name: NAV_LABELS.sectionFinance });
    expect(finance.getAttribute("aria-current")).toBe("true");
    expect(finance.getAttribute("href")).toBe("/w/acme?folder=finance");
    expect(screen.getByRole("link", { name: NAV_LABELS.expenses }).getAttribute("href")).toBe(
      "/w/acme/expenses",
    );
    expect(
      screen.getByRole("link", { name: NAV_LABELS.expenses }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("link", { name: NAV_LABELS.sectionBuy }).getAttribute("aria-current")).toBe(
      null,
    );
    expect(screen.queryByRole("link", { name: /ترک عضویت/ })).toBeNull();
    expect(screen.getAllByRole("link")[0]?.textContent).toBe("خلاصه");
    expect(screen.getAllByRole("link")[0]?.getAttribute("href")).toBe("/w/acme");
  });

  it("renders kind, space, and section as links", () => {
    render(
      <ShellPageTrail
        dense
        items={[
          { label: "گروهی", href: "/spaces?kind=group" },
          { label: "آکمه", href: "/w/acme" },
          { label: "مالی", href: "/w/acme?folder=finance" },
        ]}
      />,
    );

    const crumbs = Array.from(document.querySelectorAll(".shell-v2__crumb a"));
    expect(crumbs.map((link) => link.textContent)).toEqual(["گروهی", "آکمه", "مالی"]);
    expect(crumbs.map((link) => link.getAttribute("href"))).toEqual([
      "/spaces?kind=group",
      "/w/acme",
      "/w/acme?folder=finance",
    ]);
  });
});

describe("domain menu", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not offer leave membership", () => {
    render(<ShellWorkspaceNavMenu template="friends_family" slug="acme" />);
    fireEvent.click(screen.getByRole("button", { name: "منوی فضای کاری" }));
    expect(screen.queryByRole("menuitem", { name: /ترک عضویت/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: new RegExp(NAV_LABELS.expenses) })).toBeTruthy();
  });
});
