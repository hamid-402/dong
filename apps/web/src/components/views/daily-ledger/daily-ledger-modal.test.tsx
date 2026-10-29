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
    return (
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
});
