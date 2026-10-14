/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceSwitcher } from "@/components/mosaic/workspace-switcher";

const push = vi.fn();
const nav = vi.hoisted(() => ({ pathname: "/home" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    ready: true,
    workspaceId: "workspace-1",
    workspaceName: "خانه",
    selectWorkspace: vi.fn(),
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
    localStorage.clear();
    nav.pathname = "/home";
    vi.clearAllMocks();
  });

  it("shows the current space name and kind, then switches in one click", () => {
    localStorage.setItem(
      "dang-recent-workspaces",
      JSON.stringify([
        {
          workspaceId: "workspace-2",
          visitedAt: "2026-10-13T00:00:00.000Z",
          visitCount: 2,
        },
      ]),
    );
    render(<WorkspaceSwitcher />);

    const trigger = screen.getByRole("button", { name: "فضای جاری: خانه، گروه" });
    expect(trigger.textContent).toContain("خانه");
    expect(trigger.textContent).toContain("گروه");

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "فهرست فضاهای کاری" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "جستجوی فضا" })).toBeTruthy();
    expect(screen.getByText("اخیر")).toBeTruthy();
    expect(screen.getAllByRole("option", { name: /شرکت/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: /خانه/ }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("combobox", { name: "جستجوی فضا" }), {
      target: { value: "شرکت" },
    });
    expect(screen.getByRole("option", { name: /شرکت/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^خانه/ })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /شرکت/ }));
    expect(push).toHaveBeenCalledWith("/w/company/space");
  });

  it("lists only the current kind inside a space, with a link to that kind", () => {
    nav.pathname = "/w/home";
    render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "فضای جاری: خانه، گروه" }));

    expect(screen.getAllByRole("option", { name: /خانه/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("option", { name: /شرکت/ })).toBeNull();
    const kindLink = screen.getByRole("link", { name: "همهٔ فضاهای گروهی" });
    expect(kindLink.getAttribute("href")).toBe("/spaces?kind=group");
    expect(screen.getByRole("link", { name: "همه فضاها" }).getAttribute("href")).toBe("/spaces");
  });

  it("offers leave membership inside the menu and omits it when no target is set", () => {
    const { unmount } = render(
      <WorkspaceSwitcher leaveHref="/w/home/settings#danger" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "فضای جاری: خانه، گروه" }));
    const leave = screen.getByRole("link", {
      name: "رفتن به منطقهٔ خطر تنظیمات برای قطع عضویت یا بایگانی",
    });
    expect(leave.getAttribute("href")).toBe("/w/home/settings#danger");
    expect(leave.textContent).toContain("ترک عضویت");
    unmount();

    render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "فضای جاری: خانه، گروه" }));
    expect(
      screen.queryByRole("link", {
        name: "رفتن به منطقهٔ خطر تنظیمات برای قطع عضویت یا بایگانی",
      }),
    ).toBeNull();
  });

  it("keeps switcher controls at a 44px target", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../app/shell.css"),
      "utf8",
    );
    for (const selector of [
      ".mosaic-ws-switch__trigger",
      ".mosaic-ws-switch__option",
      ".mosaic-ws-switch__pin",
      ".mosaic-ws-switch__searchInput",
      ".mosaic-ws-switch__footer a",
    ]) {
      const block = css.slice(css.indexOf(`${selector}{`));
      expect(block.slice(0, 400)).toMatch(/min-height:\s*44px/);
    }
  });
});
