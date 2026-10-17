/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ShellKindHeaderSwitcher,
  kindHeaderSpaceSummary,
  kindHeaderTriggerLabel,
} from "@/components/shell/shell-kind-header-switcher";

const push = vi.fn();
const selectWorkspace = vi.fn();
const nav = vi.hoisted(() => ({
  pathname: "/spaces",
  search: "kind=group",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    ready: true,
    workspaceId: "workspace-1",
    workspaceName: "خانه",
    selectWorkspace,
    capabilities: { productFlags: {} },
    workspaces: [
      {
        id: "workspace-1",
        name: "خانه",
        slug: "home",
        template: "friends_family",
        myRole: "owner",
      },
      {
        id: "workspace-2",
        name: "شرکت",
        slug: "company",
        template: "small_team",
      },
      {
        id: "workspace-3",
        name: "دفتر",
        slug: "desk",
        template: "personal",
        archivedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  }),
}));

describe("kind header switcher", () => {
  afterEach(() => {
    cleanup();
    nav.pathname = "/spaces";
    nav.search = "kind=group";
    vi.clearAllMocks();
  });

  it("labels triggers with kind and current space name when active", () => {
    expect(
      kindHeaderTriggerLabel({
        kind: "group",
        activeKind: "group",
        inWorkspace: true,
        spaceName: "آکمه",
      }),
    ).toBe("گروهی · آکمه");
    expect(
      kindHeaderTriggerLabel({
        kind: "personal",
        activeKind: "group",
        inWorkspace: true,
        spaceName: "آکمه",
      }),
    ).toBe("شخصی");
    expect(
      kindHeaderSpaceSummary({
        id: "1",
        name: "x",
        slug: "x",
        template: "personal",
        archivedAt: "2026-01-01",
        myRole: "owner",
      }),
    ).toMatch(/بایگانی/);
  });

  it("renders four kind buttons and opens one dropdown at a time", () => {
    render(<ShellKindHeaderSwitcher />);
    const triggers = [
      screen.getByRole("button", { name: "شخصی" }),
      screen.getByRole("button", { name: "گروهی" }),
      screen.getByRole("button", { name: "سازمان" }),
      screen.getByRole("button", { name: "ساختمان" }),
    ];
    expect(triggers).toHaveLength(4);
    expect(screen.getByRole("button", { name: "گروهی" }).className).toMatch(/is-active/);

    fireEvent.click(screen.getByRole("button", { name: "گروهی" }));
    expect(screen.getByRole("dialog", { name: "فضاهای گروهی" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /خانه/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "همه‌ی فضاها" }).getAttribute("href")).toBe(
      "/spaces?kind=group",
    );
    expect(
      screen.getByRole("link", { name: "داشبورد همه‌ی گروهی" }).getAttribute("href"),
    ).toBe("/spaces/reports?kind=group&months=6");
    expect(screen.getByRole("link", { name: "ساخت فضای جدید" }).getAttribute("href")).toBe(
      "/spaces/new?kind=group",
    );

    fireEvent.click(screen.getByRole("button", { name: "سازمان" }));
    expect(screen.queryByRole("dialog", { name: "فضاهای گروهی" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "فضاهای سازمان" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "همه‌ی فضاها" }).getAttribute("href")).toBe(
      "/spaces?kind=org",
    );
    expect(
      screen.getByRole("link", { name: "داشبورد همه‌ی سازمان" }).getAttribute("href"),
    ).toBe("/spaces/reports?kind=org&months=6");
    expect(screen.queryByRole("link", { name: "ساخت فضای جدید" })).toBeNull();
  });

  it("shows the space name on the active kind inside a workspace", () => {
    nav.pathname = "/w/home";
    nav.search = "";
    render(<ShellKindHeaderSwitcher />);
    expect(screen.getByRole("button", { name: "گروهی · خانه" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "گروهی · خانه" }));
    expect(screen.getByRole("option", { name: /خانه/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("option", { name: /خانه/ }));
    expect(selectWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(push).toHaveBeenCalledWith("/w/home/space");
  });

  it("supports Escape, arrows, and aria attributes", async () => {
    render(<ShellKindHeaderSwitcher />);
    const group = screen.getByRole("button", { name: "گروهی" });
    expect(group.getAttribute("aria-haspopup")).toBe("dialog");
    expect(group.getAttribute("aria-expanded")).toBe("false");

    group.focus();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(group.getAttribute("aria-expanded")).toBe("true");
    const option = await screen.findByRole("option", { name: /خانه/ });
    fireEvent.keyDown(option, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(group);
    });

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "سازمان" }));
  });

  it("hides search until a kind has more than six spaces and keeps 44px targets", () => {
    render(<ShellKindHeaderSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "گروهی" }));
    expect(screen.queryByRole("combobox", { name: "جستجوی فضا" })).toBeNull();

    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../app/shell.css"),
      "utf8",
    );
    expect(css).toContain(".shell-kindSwitch");
    expect(css).not.toContain(".kindSwitcher");
    const block = css.slice(css.indexOf(".shell-kindSwitch__trigger {"));
    expect(block.slice(0, 420)).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(
      /@media \(max-width: 767px\)\s*\{[^}]*\.shell-kindSwitch\s*\{[^}]*display:\s*none/,
    );
    const header = css.slice(css.indexOf("/* Header bar — one 56px row."));
    expect(header).toMatch(/\.shell-v2__bar\s*\{[^}]*height:\s*56px/);
  });
});
