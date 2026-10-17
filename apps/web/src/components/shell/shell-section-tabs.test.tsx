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
  sectionTabsCurrentLabel,
  WorkspaceSectionTabs,
} from "@/components/shell/space-kind-header-tabs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/w/acme/charts",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/use-viewport", () => ({
  useViewportMode: vi.fn(() => "desktop"),
  VIEWPORT_TABLET_MIN: 768,
  VIEWPORT_DESKTOP_MIN: 1024,
}));

import { useViewportMode } from "@/lib/use-viewport";

describe("workspace section tabs", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useViewportMode).mockReturnValue("desktop");
  });

  it("shows a short primary row and keeps the rest under بیشتر", () => {
    render(
      <WorkspaceSectionTabs
        template="friends_family"
        slug="acme"
        role="owner"
        pathname="/w/acme/expenses"
        folder={null}
        activeDomain="finance"
        isHrefActive={(href) => href === "/w/acme/expenses"}
      />,
    );

    expect(screen.getByRole("link", { name: "خلاصه" }).getAttribute("href")).toBe(
      "/w/acme",
    );
    expect(screen.getByRole("link", { name: NAV_LABELS.expenses })).toBeTruthy();
    expect(screen.getByRole("link", { name: NAV_LABELS.settlements })).toBeTruthy();
    expect(screen.getByRole("link", { name: NAV_LABELS.members })).toBeTruthy();
    expect(screen.queryByRole("link", { name: NAV_LABELS.sectionFinance })).toBeNull();
    expect(screen.queryByRole("link", { name: NAV_LABELS.recurring })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "بیشتر" }));
    expect(screen.getByRole("menuitem", { name: NAV_LABELS.recurring })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: NAV_LABELS.invoices })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: NAV_LABELS.ledger })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: NAV_LABELS.settings })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ترک عضویت/ })).toBeNull();
  });

  it("places گزارش و نمودار after خلاصه without duplicating charts in بیشتر", () => {
    render(
      <WorkspaceSectionTabs
        template="friends_family"
        slug="acme"
        role="owner"
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

    fireEvent.click(screen.getByRole("button", { name: "بیشتر" }));
    expect(screen.queryByRole("menuitem", { name: NAV_LABELS.charts })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: NAV_LABELS.statements })).toBeNull();
  });

  it("highlights بیشتر with the active nested item name", () => {
    render(
      <WorkspaceSectionTabs
        template="friends_family"
        slug="acme"
        role="owner"
        pathname="/w/acme/recurring"
        folder={null}
        activeDomain="finance"
        isHrefActive={(href) => href === "/w/acme/recurring"}
      />,
    );

    const more = screen.getByRole("button", {
      name: `بیشتر: ${NAV_LABELS.recurring}`,
    });
    expect(more.className).toContain("is-active");
    expect(more.getAttribute("aria-current")).toBe("true");
    expect(more.textContent).toContain(NAV_LABELS.recurring);
  });

  it("uses a single بخش trigger and bottom sheet on mobile", () => {
    vi.mocked(useViewportMode).mockReturnValue("mobile");
    render(
      <WorkspaceSectionTabs
        template="friends_family"
        slug="acme"
        role="owner"
        pathname="/w/acme/expenses"
        folder={null}
        activeDomain="finance"
        isHrefActive={(href) => href === "/w/acme/expenses"}
      />,
    );

    expect(screen.queryByRole("link", { name: "خلاصه" })).toBeNull();
    const trigger = screen.getByRole("button", {
      name: `بخش: ${NAV_LABELS.expenses}`,
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "خلاصه" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: NAV_LABELS.settlements })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: NAV_LABELS.recurring })).toBeTruthy();
  });

  it("resolves the mobile current label helper", () => {
    expect(
      sectionTabsCurrentLabel({
        homeActive: true,
        reportsActive: false,
        showReportsCharts: true,
        primaryItems: [],
        moreActiveItem: null,
      }),
    ).toBe("خلاصه");
    expect(
      sectionTabsCurrentLabel({
        homeActive: false,
        reportsActive: true,
        showReportsCharts: true,
        primaryItems: [],
        moreActiveItem: null,
      }),
    ).toBe(REPORTS_CHARTS_SECTION_LABEL);
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
