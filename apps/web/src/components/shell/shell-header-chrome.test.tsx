/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HeaderProfileButton } from "@/components/header-profile-button";
import { AppearanceDialog } from "@/components/theme-toggle";
import { AppShellV2 } from "@/components/shell/app-shell-v2";
import { ShellV2Provider } from "@/components/shell/shell-v2-context";
import { ThemeProvider } from "@/lib/theme";

const push = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const clearClientSession = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({ pathname: "/spaces" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/session-gate", () => ({
  SessionGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  api: { logout },
  clearClientSession,
}));

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    ready: true,
    error: null,
    userName: "حمید",
    workspaces: [],
    workspaceId: null,
    capabilities: null,
    capabilitiesUnavailable: false,
    notificationsError: null,
    offlineQueueCount: 0,
    refreshChrome: () => {},
    flushOfflineQueue: async () => {},
    selectWorkspace: () => {},
    unreadCount: 0,
    notifications: [],
    actor: null,
  }),
  useOptionalAppChrome: () => null,
  AppChromeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const here = dirname(fileURLToPath(import.meta.url));

describe("profile menu", () => {
  beforeEach(() => {
    localStorage.clear();
    logout.mockClear();
    clearClientSession.mockClear();
    push.mockClear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps notice, account, appearance, and logout — and drops the extra tools", () => {
    render(<HeaderProfileButton notice={<span>صف تأیید</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "پروفایل حمید" }));
    expect(screen.getByText("صف تأیید")).toBeTruthy();
    expect(screen.getByRole("link", { name: "حساب من" }).getAttribute("href")).toBe("/account");
    expect(screen.getByRole("button", { name: "ظاهر" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "خروج از حساب" })).toBeTruthy();
    expect(screen.queryByText("ابزارهای دیگر")).toBeNull();
    expect(screen.queryByRole("link", { name: "سازمان‌ها" })).toBeNull();
    expect(screen.queryByRole("link", { name: "ساختمان‌ها" })).toBeNull();
  });

  it("logs out with the same account action", async () => {
    render(<HeaderProfileButton />);
    fireEvent.click(screen.getByRole("button", { name: "پروفایل حمید" }));
    fireEvent.click(screen.getByRole("button", { name: "خروج از حساب" }));
    await waitFor(() => {
      expect(logout).toHaveBeenCalledOnce();
      expect(clearClientSession).toHaveBeenCalledOnce();
      expect(push).toHaveBeenCalledWith("/login");
    });
  });

  it("applies and persists every theme from the shell dialog after the menu closes", async () => {
    render(
      <ThemeProvider>
        <ShellV2Provider>
          <HeaderProfileButton />
          <AppearanceDialog />
        </ShellV2Provider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "پروفایل حمید" }));
    fireEvent.click(screen.getByRole("button", { name: "ظاهر" }));
    expect(screen.queryByRole("link", { name: "حساب من" })).toBeNull();
    const dialog = await screen.findByRole("dialog", { name: "تنظیم ظاهر" });
    await waitFor(() => {
      expect(dialog.querySelector("button")).toBeTruthy();
    });

    const themes = [
      ["سفید", "white", "light"],
      ["مشکی", "black", "dark"],
      ["کاغذی", "paper", "light"],
      ["سرمه‌ای", "midnight", "dark"],
    ] as const;
    for (const [label, theme, scheme] of themes) {
      const option = screen.getByRole("button", { name: new RegExp(label) });
      fireEvent.mouseDown(option);
      expect(screen.getByRole("dialog", { name: "تنظیم ظاهر" })).toBeTruthy();
      fireEvent.click(option);
      await waitFor(() => {
        expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
        expect(document.documentElement.getAttribute("data-scheme")).toBe(scheme);
        expect(localStorage.getItem("dang-theme")).toBe(theme);
      });
    }
  });
});

describe("home header link", () => {
  afterEach(() => {
    cleanup();
    nav.pathname = "/spaces";
  });

  it("links خانه beside the brand and marks /home as the current page", () => {
    const { unmount } = render(
      <AppShellV2>
        <span>page</span>
      </AppShellV2>,
    );
    const idle = document.querySelector("a.shell-v2__home");
    expect(idle?.getAttribute("href")).toBe("/home");
    expect(idle?.getAttribute("aria-label")).toBe("خانه");
    expect(idle?.textContent).toContain("خانه");
    expect(idle?.querySelector(".shell-icon")).toBeTruthy();
    expect(idle?.getAttribute("aria-current")).toBeNull();
    expect(document.querySelector("a.shell-v2__wordmark")?.nextElementSibling).toBe(idle);
    const main = document.querySelector("main#main.shell-v2__main");
    const frame = main?.querySelector(":scope > .page-frame");
    expect(frame).toBeTruthy();
    expect(frame?.textContent).toContain("page");
    unmount();

    nav.pathname = "/home";
    render(
      <AppShellV2>
        <span>page</span>
      </AppShellV2>,
    );
    expect(document.querySelector("a.shell-v2__home")?.getAttribute("aria-current")).toBe("page");
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
    expect(narrow).toMatch(/\.shell-sectionTabs\s*\{[^}]*overflow:\s*visible/);
    expect(narrow).not.toMatch(/\.shell-sectionTabs\s*\{[^}]*overflow-x:\s*auto/);
    expect(narrow).toMatch(/\.shell-sectionTabs__tab[\s\S]{0,700}min-height:\s*44px/);
    expect(narrow).toContain(".shell-sectionTabs__tab:focus-visible");
  });

  it("centers header bar/place to the shared page frame max-width", () => {
    const frame = css.slice(css.indexOf("* Page-frame alignment:"));
    expect(frame).toMatch(
      /\.shell-v2__bar\s*\{[^}]*max-width:\s*var\(--page-frame-max\)/,
    );
    expect(frame).toMatch(
      /\.shell-v2__bar\s*\{[^}]*margin-inline:\s*auto/,
    );
    expect(frame).toMatch(
      /\.shell-v2__place,\s*\n\.shell-v2__place--line\s*\{[\s\S]*?overflow:\s*visible/,
    );
    expect(css).toContain(".page-frame--bleed");
    expect(css).not.toContain("Do not also max-width-center the bar");
  });
});
