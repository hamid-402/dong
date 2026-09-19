/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContextualMosaicHub } from "./contextual-mosaic-hub";
import { contextualMosaicSections } from "@/lib/navigation-v2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/w/me",
  useSearchParams: () => new URLSearchParams(),
}));

describe("ContextualMosaicHub", () => {
  afterEach(cleanup);

  it("renders only destinations supplied by the canonical gated model", () => {
    const sections = contextualMosaicSections(
      "personal",
      "me",
      undefined,
      "home",
    );
    const modelHrefs = sections.flatMap((section) =>
      section.items.map((item) => item.href),
    );
    expect(modelHrefs.length).toBeGreaterThan(0);

    render(
      <ContextualMosaicHub
        sections={sections}
        title="ماموریت‌ها"
        description="مسیرهای واقعی"
      />,
    );

    const rendered = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(rendered.sort()).toEqual([...modelHrefs].sort());
    // Personal spaces have no procurement/approval gates open, so no tile may appear.
    expect(rendered.some((href) => href?.includes("/procurement"))).toBe(false);
    expect(rendered.some((href) => href?.includes("/approvals"))).toBe(false);
  });

  it("shows API-derived facts only when explicitly provided", () => {
    const sections = contextualMosaicSections(
      "friends_family",
      "home",
      undefined,
      "home",
    );
    const items = sections.flatMap((section) => section.items);
    const factKey = items[0]?.key ?? "";
    expect(factKey).not.toBe("");

    render(
      <ContextualMosaicHub
        sections={sections}
        title="ماموریت‌ها"
        description="مسیرهای واقعی"
        facts={{
          [factKey]: {
            value: "۱۲",
            label: "خرج ثبت‌شده در بازه",
          },
        }}
      />,
    );

    expect(screen.getByText("۱۲")).toBeTruthy();
    expect(screen.getByText("خرج ثبت‌شده در بازه")).toBeTruthy();
    // Tiles without a fact fall back to the neutral open affordance — never a fake number.
    expect(screen.getAllByText("باز کردن").length).toBe(items.length - 1);
  });
});
