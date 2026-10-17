/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SpaceHomeFolderDrill } from "./space-home-folder-drill";

describe("SpaceHomeFolderDrill", () => {
  afterEach(() => cleanup());

  it("renders calm header with back link and grouped destinations", () => {
    render(
      <SpaceHomeFolderDrill
        title="مالی"
        backHref="/w/demo"
        groups={[
          {
            key: "everyday",
            label: "روزمره",
            hint: "خرج و تسویه",
            items: [
              {
                key: "expenses",
                label: "خرج‌ها",
                hint: "ثبت و فهرست",
                href: "/w/demo/expenses",
              },
              {
                key: "settlements",
                label: "تسویه",
                hint: "مانده اعضا",
                href: "/w/demo/settlements",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "مالی" })).toBeTruthy();
    const back = screen.getByRole("link", { name: /بازگشت به خانهٔ فضا/ });
    expect(back.getAttribute("href")).toBe("/w/demo");
    expect(screen.getByRole("link", { name: "خرج‌ها" }).getAttribute("href")).toBe(
      "/w/demo/expenses",
    );
    expect(screen.getByRole("link", { name: "تسویه" }).getAttribute("href")).toBe(
      "/w/demo/settlements",
    );
    expect(screen.getByText("ثبت و فهرست")).toBeTruthy();
    expect(screen.queryByText("mosaicLauncher")).toBeNull();
  });

  it("keeps every destination when multiple groups are present", () => {
    render(
      <SpaceHomeFolderDrill
        title="خرید"
        backHref="/w/org"
        groups={[
          {
            key: "source",
            label: "منبع",
            items: [
              { key: "a", label: "A", hint: "ha", href: "/w/org/a" },
            ],
          },
          {
            key: "flow",
            label: "جریان",
            items: [
              { key: "b", label: "B", hint: "hb", href: "/w/org/b" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "B" })).toBeTruthy();
  });
});
