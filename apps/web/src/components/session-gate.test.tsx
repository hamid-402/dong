/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { SessionGate } from "./session-gate";
import { isExplicitDevAuthMode, bootstrapDevSession as realBootstrap } from "@/lib/api/client";

const { replace, session, bootstrapDevSession } = vi.hoisted(() => ({
  replace: vi.fn(),
  session: vi.fn(),
  bootstrapDevSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/home",
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { session },
    bootstrapDevSession,
  };
});

const passwordActor = {
  userId: "pw",
  externalSubject: "local:a@example.com",
  displayName: "A",
  authMode: "password" as const,
};

describe("SessionGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    bootstrapDevSession.mockResolvedValue(undefined);
    session.mockResolvedValue({
      authenticated: true,
      mode: "password",
      actor: passwordActor,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not bootstrap unless DevAuth was chosen explicitly", async () => {
    window.localStorage.setItem("dang.auth.mode", "password");
    render(
      <SessionGate>
        <p>inside</p>
      </SessionGate>,
    );
    expect(await screen.findByText("inside")).toBeTruthy();
    expect(bootstrapDevSession).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("dang.auth.mode")).toBe("password");
  });

  it("bootstraps an explicit dev client and still records a password actor from the server", async () => {
    window.localStorage.setItem("dang.auth.mode", "dev");
    render(
      <SessionGate>
        <p>inside</p>
      </SessionGate>,
    );
    expect(await screen.findByText("inside")).toBeTruthy();
    expect(bootstrapDevSession).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("dang.auth.mode")).toBe("password");
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps a dev client when the server actor is dev", async () => {
    const order: string[] = [];
    window.localStorage.setItem("dang.auth.mode", "dev");
    bootstrapDevSession.mockImplementation(async () => {
      order.push("boot");
    });
    session.mockImplementation(async () => {
      order.push("session");
      return {
        authenticated: true,
        mode: "dev",
        actor: { ...passwordActor, authMode: "dev", externalSubject: "other-dev" },
      };
    });
    render(
      <SessionGate>
        <p>inside</p>
      </SessionGate>,
    );
    expect(await screen.findByText("inside")).toBeTruthy();
    expect(order).toEqual(["boot", "session"]);
    expect(window.localStorage.getItem("dang.auth.mode")).toBe("dev");
  });

  it("does not clear client mode or go to login when the session check times out", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("dang.auth.mode", "password");
    session.mockImplementation(() => new Promise(() => {}));
    render(
      <SessionGate>
        <p>inside</p>
      </SessionGate>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(screen.queryByText("inside")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/نشست شما پاک نشده/);
    expect(screen.getByRole("button", { name: "تلاش دوباره" })).toBeTruthy();
    expect(window.localStorage.getItem("dang.auth.mode")).toBe("password");
    expect(replace).not.toHaveBeenCalled();
  });

  it("retries a slow session check without sending the user to login", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("dang.auth.mode", "password");
    session.mockImplementation(() => new Promise(() => {}));
    render(
      <SessionGate>
        <p>inside</p>
      </SessionGate>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    session.mockResolvedValue({
      authenticated: true,
      mode: "password",
      actor: passwordActor,
    });
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("inside")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("dang.auth.mode")).toBe("password");
  });

  it("still clears client mode when the session is actually missing", async () => {
    window.localStorage.setItem("dang.auth.mode", "password");
    session.mockResolvedValue({ authenticated: false, mode: "password", actor: undefined });
    render(
      <SessionGate>
        <p>inside</p>
      </SessionGate>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fhome");
    expect(window.localStorage.getItem("dang.auth.mode")).toBeNull();
  });
});

describe("bootstrapDevSession client guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("treats a missing auth mode as not DevAuth", () => {
    expect(isExplicitDevAuthMode()).toBe(false);
    window.localStorage.setItem("dang.auth.mode", "oidc");
    expect(isExplicitDevAuthMode()).toBe(false);
    window.localStorage.setItem("dang.auth.mode", "dev");
    expect(isExplicitDevAuthMode()).toBe(true);
  });

  it("does not post bootstrap unless DevAuth was chosen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("dang.auth.mode", "password");
    await realBootstrap();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still posts DevAuth headers when the client is explicitly dev", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("dang.auth.mode", "dev");
    window.localStorage.setItem("dang.dev.subject", "other-dev");
    window.localStorage.setItem("dang.dev.displayName", "Other");
    await realBootstrap();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/dev/bootstrap-session");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("x-dang-subject")).toBeTruthy();
  });
});
