/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupEmailVerificationNotice } from "./group-email-verification-notice";

const profile = vi.fn();
const resendVerification = vi.fn();
const chrome = {
  capabilities: { requireEmailVerification: true } as { requireEmailVerification?: boolean } | null,
};

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => chrome,
}));

vi.mock("@/lib/api", () => ({
  api: {
    profile: () => profile(),
    resendVerification: () => resendVerification(),
  },
}));

describe("GroupEmailVerificationNotice", () => {
  beforeEach(() => {
    chrome.capabilities = { requireEmailVerification: true };
    profile.mockReset();
    resendVerification.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("stays hidden when verification is not enforced or the space is personal", async () => {
    chrome.capabilities = { requireEmailVerification: false };
    profile.mockResolvedValue({ emailVerified: false, email: "a@example.com" });
    const { rerender } = render(<GroupEmailVerificationNotice active />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(profile).not.toHaveBeenCalled();

    chrome.capabilities = { requireEmailVerification: true };
    rerender(<GroupEmailVerificationNotice active={false} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(profile).not.toHaveBeenCalled();
  });

  it("shows the Persian message and resends the verification email", async () => {
    profile.mockResolvedValue({ emailVerified: false, email: "a@example.com" });
    resendVerification.mockResolvedValue({ ok: true });
    render(<GroupEmailVerificationNotice active />);

    expect(
      await screen.findByText(/ابتدا ایمیل حساب را تأیید کنید/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ارسال مجدد ایمیل تأیید" }));
    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText("ایمیل تأیید دوباره فرستاده شد.")).toBeTruthy();
  });
});
