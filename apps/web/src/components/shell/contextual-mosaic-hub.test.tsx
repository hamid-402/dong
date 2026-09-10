/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContextualMosaicHub } from "./contextual-mosaic-hub";
import { contextualMosaicSections } from "@/lib/navigation-v2";

describe("ContextualMosaicHub", () => {
  afterEach(cleanup);

  it("renders only destinations supplied by the canonical gated model", () => {
    const sections = contextualMosaicSections(
      "personal",
      "me",
      undefined,
      "home",
    );
    render(
      <ContextualMosaicHub
        sections={sections}
        title="ماموریت‌ها"
        description="مسیرهای واقعی"
      />,
    );

    expect(screen.getByRole("link", { name: /خرج‌ها/ }).getAttribute("href")).toBe(
      "/w/me/expenses",
    );
    expect(screen.queryByRole("link", { name: /تدارکات/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /مرکز تأیید/ })).toBeNull();
  });

  it("shows API-derived facts only when explicitly provided", () => {
    const sections = contextualMosaicSections(
      "friends_family",
      "home",
      undefined,
      "home",
    );
    render(
      <ContextualMosaicHub
        sections={sections}
        title="ماموریت‌ها"
        description="مسیرهای واقعی"
        facts={{
          expenses: {
            value: "۱۲",
            label: "خرج ثبت‌شده در بازه",
          },
        }}
      />,
    );

    expect(screen.getByText("۱۲")).toBeTruthy();
    expect(screen.getByText("خرج ثبت‌شده در بازه")).toBeTruthy();
    expect(screen.getAllByText("ابزار در دسترس").length).toBeGreaterThan(0);
  });
});
