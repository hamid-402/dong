/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { GroupMfaEnrollmentNotice } from "./group-mfa-enrollment-notice";

const profile = vi.fn();
const chrome = {
  capabilities: { mfa: true } as { mfa?: boolean } | null,
};

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => chrome,
}));

vi.mock("@/lib/api", () => ({
  api: {
    profile: () => profile(),
  },
}));

describe("GroupMfaEnrollmentNotice", () => {
  beforeEach(() => {
    chrome.capabilities = { mfa: true };
    profile.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("stays hidden when MFA is off, the space is not a group, or TOTP is already on", async () => {
    chrome.capabilities = { mfa: false };
    profile.mockResolvedValue({ mfaEnabled: false, mfaEnrollmentRequired: true });
    const { rerender } = render(<GroupMfaEnrollmentNotice active />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(profile).not.toHaveBeenCalled();

    chrome.capabilities = { mfa: true };
    rerender(<GroupMfaEnrollmentNotice active={false} />);
    expect(screen.queryByRole("status")).toBeNull();

    profile.mockResolvedValue({ mfaEnabled: true, mfaEnrollmentRequired: false });
    rerender(<GroupMfaEnrollmentNotice active />);
    await waitFor(() => expect(profile).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains the block in Persian and links to TOTP setup before the action", async () => {
    profile.mockResolvedValue({ mfaEnabled: false, mfaEnrollmentRequired: true });
    render(<GroupMfaEnrollmentNotice active />);

    expect(await screen.findByText(/تأیید دو مرحله‌ای \(TOTP\) را فعال کنید/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "فعال‌سازی تأیید دو مرحله‌ای" });
    expect(link.getAttribute("href")).toBe("/account/security");
  });

  it("stays hidden for a member who would not be blocked", async () => {
    profile.mockResolvedValue({ mfaEnabled: false });
    render(<GroupMfaEnrollmentNotice active />);
    await waitFor(() => expect(profile).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
