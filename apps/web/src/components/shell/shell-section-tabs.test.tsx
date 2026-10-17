/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NAV_LABELS } from "@/lib/nav-labels";
import { ShellWorkspaceNavMenu } from "@/components/shell/shell-secondary-rail";
import { ShellPageTrail } from "@/components/shell/shell-page-trail";
import {
  REPORTS_CHARTS_SECTION_LABEL,
  WorkspaceSectionTabs,
} from "@/components/shell/space-kind-header-tabs";

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
        pathname="/w/acme/expenses"
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
    expect(screen.queryByRole("link", { name: REPORTS_CHARTS_SECTION_LABEL })).toBeNull();
  });

  it("places گزارش و نمودار after خلاصه and groups charts/statements under it", () => {
    render(
      <WorkspaceSectionTabs
        template="friends_family"
        slug="acme"
        flags={{ chartsV1: true, statementsV1: true }}
        pathname="/w/acme/charts"
        folder={null}
        activeDomain="finance"
        isHrefActive={(href) => href === "/w/acme/charts"}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links[0]?.textContent).toBe("خلاصه");
    expect(links[1]?.textContent).toBe(REPORTS_CHARTS_SECTION_LABEL);
    expect(links[1]?.getAttribute("href")).toBe("/w/acme/charts");
    expect(links[1]?.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: NAV_LABELS.charts }).getAttribute("href")).toBe(
      "/w/acme/charts",
    );
    expect(screen.getByRole("link", { name: NAV_LABELS.statements }).getAttribute("href")).toBe(
      "/w/acme/statements",
    );
    // insights leaves are not duplicated under finance
    expect(screen.getAllByRole("link", { name: NAV_LABELS.charts })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: NAV_LABELS.sectionFinance }).getAttribute("aria-current"),
    ).toBe(null);
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
