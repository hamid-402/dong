/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ShellSpaceSwitcher,
  spaceSwitchTriggerLabel,
} from "@/components/shell/shell-space-switcher";

const nav = vi.hoisted(() => ({
  pathname: "/spaces",
  search: "kind=group",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    ready: true,
    workspaceId: "workspace-1",
    workspaceName: "خانه",
    selectWorkspace: vi.fn(),
    capabilities: { productFlags: {} },
    workspaces: [],
  }),
}));

describe("kind panel", () => {
  afterEach(() => {
    cleanup();
    nav.pathname = "/spaces";
    nav.search = "kind=group";
    vi.clearAllMocks();
  });

  it("names the trigger from home, a kind list, or the open space", () => {
    expect(
      spaceSwitchTriggerLabel({
        pathname: "/home",
        kind: null,
        inWorkspace: false,
        spaceName: null,
      }),
    ).toBe("همه فضاها");
    expect(
      spaceSwitchTriggerLabel({
        pathname: "/spaces",
        kind: "org",
        inWorkspace: false,
        spaceName: null,
      }),
    ).toBe("سازمان");
    expect(
      spaceSwitchTriggerLabel({
        pathname: "/w/acme",
        kind: "group",
        inWorkspace: true,
        spaceName: "آکمه",
      }),
    ).toBe("گروهی · آکمه");
  });

  it("offers the four kinds and moves focus with the arrow keys", () => {
    render(<ShellSpaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "گروهی" }));
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["شخصی", "گروهی", "سازمان", "ساختمان"]);
    expect(screen.getByRole("tab", { name: "گروهی" }).getAttribute("aria-selected")).toBe("true");

    const personal = screen.getByRole("tab", { name: "شخصی" });
    personal.focus();
    fireEvent.keyDown(personal, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "ساختمان" }));
    expect(screen.getByRole("tab", { name: "ساختمان" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a 44px kind tab and opens the panel as a sheet at 480px", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../app/shell.css"),
      "utf8",
    );
    const tab = css.slice(css.indexOf(".shell-spacePanel__tab,"));
    expect(tab.slice(0, 280)).toMatch(/min-height:\s*44px/);
    expect(tab.slice(0, 280)).toMatch(/min-width:\s*44px/);
    const narrow = css.slice(css.lastIndexOf("@media (max-width: 480px)"));
    expect(narrow).toMatch(/\.shell-spacePanel--sheet\s*\{[^}]*position:\s*fixed/);
    expect(narrow).toMatch(/\.shell-spaceSwitch__label\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).not.toContain(".kindSwitcher");
  });
});
