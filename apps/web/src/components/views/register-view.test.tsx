/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RegisterView } from "./register-view";

const searchParamsState = { value: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParamsState.value,
  usePathname: () => "/register",
}));

vi.mock("@/lib/api", () => ({
  api: {
    register: vi.fn(),
  },
  markClientSession: vi.fn(),
  setDevIdentity: vi.fn(),
}));

vi.mock("@/components/auth-shell", () => ({
  AuthShell: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
  AuthAlert: ({ children }: { children: React.ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AuthDevLink: () => null,
  AuthLinkRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("RegisterView ?next=", () => {
  beforeEach(() => {
    searchParamsState.value = new URLSearchParams();
  });
  afterEach(() => cleanup());

  it("preserves safe next on the login link", () => {
    searchParamsState.value = new URLSearchParams("next=/spaces/new");
    render(<RegisterView />);
    const login = screen.getByRole("link", { name: "ورود" });
    expect(login.getAttribute("href")).toBe(
      `/login?next=${encodeURIComponent("/spaces/new")}`,
    );
  });

  it("rejects // open redirects for next", () => {
    searchParamsState.value = new URLSearchParams("next=//evil.example");
    render(<RegisterView />);
    const login = screen.getByRole("link", { name: "ورود" });
    expect(login.getAttribute("href")).toBe("/login");
  });
});

