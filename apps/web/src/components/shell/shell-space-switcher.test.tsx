/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ShellSpaceSwitcher } from "@/components/shell/shell-space-switcher";

const push = vi.fn();
const selectWorkspace = vi.fn();
const nav = vi.hoisted(() => ({
  pathname: "/home",
  search: "",
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
      },
      {
        id: "workspace-2",
        name: "شرکت",
        slug: "company",
        template: "small_team",
      },
    ],
  }),
}));

describe("space switcher", () => {
  afterEach(() => {
    cleanup();
    nav.pathname = "/home";
    nav.search = "";
    vi.clearAllMocks();
  });

  it("labels home as همه فضاها and filters the list by the selected kind", () => {
    render(<ShellSpaceSwitcher />);
    const trigger = screen.getByRole("button", { name: "همه فضاها" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "فهرست فضاهای کاری" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "شخصی" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("option", { name: /خانه/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "گروهی" }));
    expect(screen.getByRole("option", { name: "خانه" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /شرکت/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "سازمان" }));
    fireEvent.change(screen.getByRole("combobox", { name: "جستجوی فضا" }), {
      target: { value: "شرکت" },
    });
    expect(screen.getByRole("option", { name: "شرکت" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "خانه" })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: "شرکت" }));
    expect(selectWorkspace).toHaveBeenCalledWith("workspace-2");
    expect(push).toHaveBeenCalledWith("/w/company");
  });

  it("shows kind and space name inside a space, with kind list, create, and leave", () => {
    nav.pathname = "/w/home";
    render(<ShellSpaceSwitcher leaveHref="/w/home/settings#danger" />);
    fireEvent.click(screen.getByRole("button", { name: "گروهی · خانه" }));

    expect(screen.getByRole("tab", { name: "گروهی" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "خانه" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("option", { name: /شرکت/ })).toBeNull();
    expect(screen.getByRole("link", { name: "همه‌ی فضاهای این نوع" }).getAttribute("href")).toBe(
      "/spaces?kind=group",
    );
    expect(screen.getByRole("link", { name: "همه فضاها" }).getAttribute("href")).toBe("/spaces");
    expect(screen.getByRole("link", { name: "ساخت فضا" }).getAttribute("href")).toBe(
      "/spaces/new?kind=group",
    );
    const leave = screen.getByRole("link", {
      name: "رفتن به منطقهٔ خطر تنظیمات برای قطع عضویت یا بایگانی",
    });
    expect(leave.getAttribute("href")).toBe("/w/home/settings#danger");
    expect(leave.textContent).toContain("خروج از فضا");
  });

  it("omits leave outside a space and moves through the list with arrows", async () => {
    nav.pathname = "/w/home";
    const { unmount } = render(<ShellSpaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "گروهی · خانه" }));
    expect(
      screen.queryByRole("link", {
        name: "رفتن به منطقهٔ خطر تنظیمات برای قطع عضویت یا بایگانی",
      }),
    ).toBeNull();
    unmount();

    render(<ShellSpaceSwitcher leaveHref="/w/home/settings#danger" />);
    const trigger = screen.getByRole("button", { name: "گروهی · خانه" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const search = await screen.findByRole("combobox", { name: "جستجوی فضا" });
    await waitFor(() => expect(document.activeElement).toBe(search));

    fireEvent.keyDown(search, { key: "ArrowDown" });
    const option = screen.getByRole("option", { name: "خانه" });
    expect(document.activeElement).toBe(option);

    fireEvent.keyDown(option, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("traps tab inside the panel and keeps 44px targets", () => {
    nav.pathname = "/w/home";
    render(<ShellSpaceSwitcher leaveHref="/w/home/settings#danger" />);
    fireEvent.click(screen.getByRole("button", { name: "گروهی · خانه" }));
    const dialog = screen.getByRole("dialog", { name: "فهرست فضاهای کاری" });
    const first = screen.getByRole("tab", { name: "گروهی" });
    const last = screen.getByRole("link", {
      name: "رفتن به منطقهٔ خطر تنظیمات برای قطع عضویت یا بایگانی",
    });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../app/shell.css"),
      "utf8",
    );
    const header = css.slice(css.indexOf("/* Header bar — one 56px row."));
    for (const selector of [
      ".shell-spaceSwitch__trigger {",
      ".shell-spacePanel__option,",
      ".shell-spacePanel__search,",
      ".shell-spacePanel__footer a {",
    ]) {
      const block = header.slice(header.indexOf(selector));
      expect(block.slice(0, 420)).toMatch(/min-height:\s*44px/);
    }
    expect(css).toContain(".shell-spacePanel--sheet");
    expect(css).toMatch(/\.shell-spacePanel--sheet\s*\{[^}]*bottom:\s*0/);
    expect(css).toContain("outline: 3px solid var(--dang-focus, var(--primary))");
  });
});
