/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { OperationsRoomPreview } from "./operations-room-preview";
import { PREVIEW_SCREENS } from "./operations-room-model";

const push = vi.fn();
const replace = vi.fn();
let query = new URLSearchParams(
  "role=owner&template=small_team&flags=full&mfa=enrolled",
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/design-preview/operations-room/workspace-home",
  useSearchParams: () => query,
}));

describe("operations room preview", () => {
  beforeEach(() => {
    query = new URLSearchParams(
      "role=owner&template=small_team&flags=full&mfa=enrolled",
    );
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("opens the command center from Ctrl+K and navigates to a result", () => {
    render(<OperationsRoomPreview initialScreen="workspace-home" />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "مرکز فرمان" });
    expect(dialog).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "جستجوی فرمان" }), {
      target: { value: "صورتحساب" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /صورتحساب‌ها/ }));
    expect(push).toHaveBeenCalledWith(
      expect.stringContaining("/design-preview/operations-room/invoices"),
    );
  });

  it("switches to the constrained mobile presentation", () => {
    const { container } = render(
      <OperationsRoomPreview initialScreen="workspace-home" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "موبایل" }));
    expect(container.querySelector('[class*="mobileStage"]')).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "ناوبری موبایل" })).toBeTruthy();
  });

  it("renders every canonical screen with its own heading", () => {
    const view = render(<OperationsRoomPreview initialScreen="login" />);
    expect(screen.getAllByRole("heading", { name: "ورود" }).length).toBeGreaterThan(0);

    for (const item of PREVIEW_SCREENS.slice(1)) {
      view.rerender(<OperationsRoomPreview initialScreen={item.id} />);
      expect(
        screen.getAllByRole("heading", { name: item.title }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("shows a read-only state and disables mutation for an auditor", () => {
    query = new URLSearchParams(
      "role=auditor&template=small_team&flags=full&mfa=enrolled",
    );
    render(<OperationsRoomPreview initialScreen="expenses" />);

    expect(screen.getByText("این نما فقط‌خواندنی است")).toBeTruthy();
    const createButtons = screen.getAllByRole("button", { name: /ثبت خرج/ });
    expect(createButtons.some((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
  });

  it("exposes all nine roles in the access lab", () => {
    render(<OperationsRoomPreview initialScreen="procurement" />);
    fireEvent.click(screen.getByRole("button", { name: "آزمایشگاه دسترسی" }));

    expect(screen.getByRole("dialog", { name: "آزمایشگاه دسترسی" })).toBeTruthy();
    for (const role of [
      "مالک",
      "ادمین",
      "مدیر مالی",
      "تأییدکننده",
      "خریدار",
      "امانت‌دار تجهیزات",
      "عضو",
      "ناظر",
      "مهمان",
    ]) {
      expect(within(screen.getByRole("dialog", { name: "آزمایشگاه دسترسی" })).getAllByText(role).length).toBeGreaterThan(0);
    }
  });
});
