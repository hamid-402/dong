/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppTabbar } from "./app-tabbar";
import { NAV_LABELS } from "@/lib/nav-labels";
import type { BottomTabV2 } from "@/lib/navigation-v2";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/shell/shell-v2-context", () => ({
  useShellLocation: () => null,
}));

const tabs: BottomTabV2[] = [
  { key: "home", label: "خانه", href: "/home", icon: "home" },
  { key: "spaces", label: "فضاها", href: "/spaces", icon: "partners" },
  { key: "expenses", label: "خرج", href: "/w/demo/record", icon: "wallet" },
  { key: "more", label: "حساب", href: "/account", icon: "settings" },
];

describe("AppTabbar FAB", () => {
  afterEach(() => cleanup());

  it("renders expense FAB when fabHref is set", () => {
    render(<AppTabbar tabs={tabs} fabHref="/w/demo/record" variant="dock" />);
    const fab = screen.getByRole("link", { name: NAV_LABELS.addExpense });
    expect(fab.getAttribute("href")).toBe("/w/demo/record");
  });

  it("omits FAB slot when fabHref is null", () => {
    render(<AppTabbar tabs={tabs} fabHref={null} variant="dock" />);
    expect(screen.queryByRole("link", { name: NAV_LABELS.addExpense })).toBeNull();
  });
});
