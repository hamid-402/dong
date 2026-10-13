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
  });

  it("omits the space name and kind from the slim trail", () => {
    render(
      <ShellPageTrail
        dense
        omitLabels={["آکمه", "گروه"]}
        items={[
          { label: "خانه", href: "/home" },
          { label: "گروه", href: "/spaces?kind=group" },
          { label: "آکمه", href: "/w/acme" },
          { label: "مالی", href: "/w/acme?folder=finance", group: true },
          { label: "نمودارها" },
        ]}
      />,
    );

    expect(screen.queryByText("آکمه")).toBeNull();
    expect(screen.queryByText("گروه")).toBeNull();
    expect(screen.getByText("خانه")).toBeTruthy();
    expect(screen.getByText("مالی")).toBeTruthy();
    expect(screen.getByText("نمودارها")).toBeTruthy();
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
