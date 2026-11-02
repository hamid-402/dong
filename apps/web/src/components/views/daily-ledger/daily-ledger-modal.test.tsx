/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DailyLedgerModal } from "./daily-ledger-modal";

const appModalSpy = vi.fn();

vi.mock("@/components/ui/app-modal", () => ({
  AppModal: (props: {
    open: boolean;
    ariaLabel: string;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
    panelClassName?: string;
  }) => {
    appModalSpy(props);
    if (!props.open) return null;
    // Mirror @dang/ui Modal root class so run29b inert-bg effect can find it.
    return (
      <div className="dang-modal" role="presentation">
        <div
          role="dialog"
          aria-label={props.ariaLabel}
          data-panel-class={props.panelClassName ?? ""}
        >
          {props.title ? <h2>{props.title}</h2> : null}
          {props.children}
          <button type="button" onClick={props.onClose}>
            close
          </button>
        </div>
      </div>
    );
  },
}));

describe("DailyLedgerModal", () => {
  afterEach(() => {
    cleanup();
    appModalSpy.mockClear();
  });

  it("run28-modal-panelClassName: forwards panelClassName to AppModal", () => {
    render(
      <DailyLedgerModal
        open
        ariaLabel="افزودن کالا"
        title="افزودن قلم"
        onClose={() => undefined}
        panelClassName="ledger-modal--mobile-safe"
      >
        <p>body</p>
      </DailyLedgerModal>,
    );

    expect(screen.getByRole("dialog", { name: "افزودن کالا" })).toBeTruthy();
    expect(appModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        panelClassName: "ledger-modal--mobile-safe",
        open: true,
        ariaLabel: "افزودن کالا",
      }),
    );
    expect(screen.getByRole("dialog").getAttribute("data-panel-class")).toBe(
      "ledger-modal--mobile-safe",
    );
  });

  it("run29b-modal-touch-style: injects scoped ≥44px touch CSS for .dang-modal controls", () => {
    render(
      <DailyLedgerModal
        open
        ariaLabel="افزودن کالا"
        title="افزودن قلم"
        onClose={() => undefined}
        panelClassName="ledger-modal--mobile-safe"
      >
        <button type="button">ثبت</button>
      </DailyLedgerModal>,
    );

    const style = screen.getByTestId("daily-ledger-modal-touch-style");
    expect(style.tagName).toBe("STYLE");
    const css = style.textContent ?? "";
    expect(css).toContain(".dang-modal button");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-width: 44px");
    // panelClassName still forwarded (no regression)
    expect(appModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        panelClassName: "ledger-modal--mobile-safe",
        open: true,
      }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ثبت" })).toBeTruthy();
  });

  it("run29b-modal-touch-style: style remains mounted while modal is closed", () => {
    render(
      <DailyLedgerModal open={false} ariaLabel="بسته" onClose={() => undefined}>
        <p>hidden</p>
      </DailyLedgerModal>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    const style = screen.getByTestId("daily-ledger-modal-touch-style");
    expect(style.textContent ?? "").toContain("min-height: 44px");
  });

  it("run29b-modal-inert-bg: marks ancestor siblings inert while open; clears on close", async () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-testid", "app-shell");
    document.body.appendChild(shell);

    const chrome = document.createElement("button");
    chrome.type = "button";
    chrome.textContent = "دفتر";
    chrome.setAttribute("data-testid", "bg-crumb");
    shell.appendChild(chrome);

    const host = document.createElement("div");
    host.setAttribute("data-testid", "modal-host");
    shell.appendChild(host);

    const { rerender, unmount } = render(
      <DailyLedgerModal open ariaLabel="افزودن کالا" onClose={() => undefined}>
        <p>body</p>
      </DailyLedgerModal>,
      { container: host },
    );

    await vi.waitFor(() => {
      expect(chrome.hasAttribute("inert")).toBe(true);
    });
    // Modal dialog itself must stay operable (not inert).
    expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();

    rerender(
      <DailyLedgerModal open={false} ariaLabel="افزودن کالا" onClose={() => undefined}>
        <p>body</p>
      </DailyLedgerModal>,
    );

    await vi.waitFor(() => {
      expect(chrome.hasAttribute("inert")).toBe(false);
    });

    unmount();
    shell.remove();
  });
});

