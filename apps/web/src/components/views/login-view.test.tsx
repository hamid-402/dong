/**
 * @vitest-environment jsdom
 * Login form validation behavior (no network).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LoginView } from "./login-view";

const searchParamsState = { value: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParamsState.value,
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
    footer,
  }: {
    children: React.ReactNode;
    title: string;
    footer?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
      {footer}
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
    searchParamsState.value = new URLSearchParams();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows email validation error and does not call login", async () => {
    const { api } = await import("@/lib/api");
    render(<LoginView />);
    const email = document.getElementById("login-email") as HTMLInputElement;
    const password = document.getElementById("login-password") as HTMLInputElement;
    // Login accepts username/phone too, so only a malformed email is rejected here.
    fireEvent.change(email, { target: { value: "bad@example" } });
    fireEvent.change(password, { target: { value: "x" } });
    fireEvent.submit(email.closest("form")!);
    expect(await screen.findByText("آدرس ایمیل نامعتبر است")).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  it("keeps a single forgot-password link beside the password field", () => {
    render(<LoginView />);
    const links = screen.getAllByRole("link", { name: "فراموشی رمز" });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/forgot-password");
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

  it("preserves safe ?next= on the register link", () => {
    searchParamsState.value = new URLSearchParams("next=/w/demo/record");
    render(<LoginView />);
    const register = screen.getByRole("link", { name: "ساخت حساب" });
    expect(register.getAttribute("href")).toBe(
      `/register?next=${encodeURIComponent("/w/demo/record")}`,
    );
  });

  it("drops open-redirect ?next= and links to plain /register", () => {
    searchParamsState.value = new URLSearchParams("next=//evil.example");
    render(<LoginView />);
    const register = screen.getByRole("link", { name: "ساخت حساب" });
    expect(register.getAttribute("href")).toBe("/register");
  });
});

