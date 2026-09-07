/**
 * @vitest-environment jsdom
 * Keyboard and mobile-critical shell affordances.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspaceSwitcher } from "@/components/mosaic/workspace-switcher";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellV2Provider } from "@/components/shell/shell-v2-context";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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

describe("shell usability", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens command search from Ctrl+K and exposes an explicit close action", async () => {
    render(
      <ShellV2Provider>
        <CommandPalette />
      </ShellV2Provider>,
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(await screen.findByRole("dialog", { name: "یافتن در دنگ" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "جستجوی صفحه، فضا یا اقدام" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بستن جستجو" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the workspace list with ArrowDown and focuses the selected workspace", async () => {
    render(<WorkspaceSwitcher />);
    const trigger = screen.getByRole("button", { name: /فضای کاری\s*خانه/ });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const selected = await screen.findByRole("option", {
      name: /خانه/,
      selected: true,
    });
    await waitFor(() => expect(document.activeElement).toBe(selected));
  });
});
