/**
 * @vitest-environment jsdom
 * Login form validation behavior (no network).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LoginView } from "./login-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));

vi.mock("@/lib/api", () => ({
  api: {
    login: vi.fn(),
    mfaVerify: vi.fn(),
    oidcStatus: vi.fn().mockResolvedValue({ configured: false }),
  },
  markClientSession: vi.fn(),
  setDevIdentity: vi.fn(),
}));

vi.mock("@/components/auth-shell", () => ({
  AuthShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  AuthAlert: ({ children }: { children: React.ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AuthDivider: () => null,
  AuthDevLink: () => null,
  AuthLinkRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("LoginView validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows email validation error and does not call login", async () => {
    const { api } = await import("@/lib/api");
    render(<LoginView />);
    const email = document.getElementById("login-email") as HTMLInputElement;
    const password = document.getElementById("login-password") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "bad" } });
    fireEvent.change(password, { target: { value: "x" } });
    fireEvent.submit(email.closest("form")!);
    expect(await screen.findByText("آدرس ایمیل نامعتبر است")).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  it("requires password", async () => {
    const { api } = await import("@/lib/api");
    render(<LoginView />);
    const email = document.getElementById("login-email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "a@b.co" } });
    fireEvent.submit(email.closest("form")!);
    expect(await screen.findByText("رمز عبور را وارد کنید")).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });
});
