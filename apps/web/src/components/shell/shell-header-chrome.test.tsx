/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { headerToolLinks } from "@/components/shell/app-shell-v2";

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    ready: true,
    error: null,
    userName: "حمید",
  }),
}));

const here = dirname(fileURLToPath(import.meta.url));

describe("header tool links", () => {
  it("keeps every overflow destination, scoped to the open space when one exists", () => {
    expect(headerToolLinks(null).map((item) => [item.label, item.href])).toEqual([
      ["سازمان‌ها", "/home"],
      ["ساختمان‌ها", "/spaces?kind=building"],
      ["گزارش ساختمان", "/spaces/reports?kind=building"],
      ["تدارکات", "/home"],
      ["تجهیزات", "/home"],
      ["پیشنهادها", "/home"],
      ["شرکا", "/home"],
    ]);
    expect(headerToolLinks("acme").map((item) => item.href)).toEqual([
      "/w/acme/space",
      "/spaces?kind=building",
      "/spaces/reports?kind=building",
      "/w/acme/procurement",
      "/w/acme/assets",
      "/w/acme/proposals",
      "/w/acme/partners",
    ]);
  });
});

describe("profile menu", () => {
  afterEach(() => {
    cleanup();
  });

  it("puts the extra tools under a section and keeps the account link", () => {
    render(<HeaderProfileButton tools={headerToolLinks("acme")} />);
    fireEvent.click(screen.getByRole("button", { name: "پروفایل حمید" }));
    expect(screen.getByRole("link", { name: "پروفایل حمید" }).getAttribute("href")).toBe(
      "/account",
    );
    expect(screen.getByText("ابزارهای دیگر")).toBeTruthy();
    for (const tool of headerToolLinks("acme")) {
      expect(screen.getByRole("link", { name: tool.label }).getAttribute("href")).toBe(tool.href);
    }
  });
});

describe("narrow header css", () => {
  const css = readFileSync(resolve(here, "../../app/shell.css"), "utf8");

  it("keeps a 56px bar, a 44px search icon, and one row on a narrow screen", () => {
    const narrow = css.slice(css.indexOf(".shell-v2__zone--start .shell-spaceSwitch"));
    expect(css).toMatch(/\.shell-v2__bar\s*\{[^}]*height:\s*56px/);
    expect(css).toContain("background: var(--dang-bg)");
    expect(css).toContain("var(--dang-border, var(--dang-line))");
    expect(narrow).toContain("flex-wrap: nowrap");
    expect(narrow).toMatch(/\.shell-v2__search\s*\{[^}]*width:\s*44px/);
    expect(narrow).toMatch(/\.shell-v2__search\s*\{[^}]*min-height:\s*44px/);
    expect(narrow).toContain("outline: 3px solid var(--dang-focus, var(--primary))");
    expect(narrow).toMatch(/\.shell-sectionTabs\s*\{[^}]*overflow-x:\s*auto/);
    expect(narrow).toMatch(/\.shell-sectionTabs__tab[\s\S]{0,700}min-height:\s*44px/);
    expect(narrow).toContain(".shell-sectionTabs__tab:focus-visible");
  });
});
