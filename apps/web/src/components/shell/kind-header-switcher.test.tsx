/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KindHeaderSwitcher, kindSwitcherHref } from "@/components/shell/space-kind-header-tabs";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn() }),
  usePathname: () => "/spaces",
  useSearchParams: () => new URLSearchParams("kind=group"),
}));

describe("kind switcher", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers the four kinds in order and marks the active one", () => {
    render(<KindHeaderSwitcher activeKind="org" workspaces={[]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "شخصی",
      "گروهی",
      "سازمان",
      "ساختمان",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/spaces?kind=personal",
      "/spaces?kind=group",
      "/spaces?kind=org",
      "/spaces?kind=building",
    ]);
    expect(screen.getByRole("link", { name: "سازمان" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "گروهی" }).getAttribute("aria-current")).toBeNull();
  });

  it("sends personal straight to the only personal space", () => {
    expect(
      kindSwitcherHref("personal", [{ slug: "me", template: "personal" }]),
    ).toBe("/w/me");
    render(
      <KindHeaderSwitcher
        activeKind="personal"
        workspaces={[{ slug: "me", template: "personal" }]}
      />,
    );
    expect(screen.getByRole("link", { name: "شخصی" }).getAttribute("href")).toBe("/w/me");
  });

  it("moves focus with the arrow keys and navigates from the narrow select", () => {
    render(<KindHeaderSwitcher activeKind="group" workspaces={[]} />);
    const personal = screen.getByRole("link", { name: "شخصی" });
    personal.focus();
    fireEvent.keyDown(personal, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "ساختمان" }));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "building" } });
    expect(push).toHaveBeenCalledWith("/spaces?kind=building");
  });

  it("keeps a 44px segmented control and a dropdown at 480px", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../app/shell.css"),
      "utf8",
    );
    const seg = css.slice(css.indexOf(".kindSwitcher__seg{"));
    expect(seg.slice(0, 400)).toMatch(/min-height:\s*44px/);
    expect(seg.slice(0, 500)).toMatch(/min-width:\s*44px/);
    expect(css).toContain(".kindSwitcher__seg:focus-visible");
    expect(css).toContain("outline: 3px solid var(--dang-focus, var(--primary))");
    const narrow = css.slice(css.indexOf("@media (max-width: 480px)"));
    expect(narrow).toMatch(/\.kindSwitcher__segments\s*\{[^}]*display:\s*none/);
    expect(narrow).toMatch(/\.kindSwitcher__dropdown\s*\{[^}]*display:\s*block/);
    expect(narrow).toMatch(/\.kindSwitcher__select\s*\{[^}]*min-height:\s*44px/);
  });
});
