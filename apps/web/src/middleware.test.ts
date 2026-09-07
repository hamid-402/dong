import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, pathMatchesPrefix } from "./middleware";

describe("pathMatchesPrefix", () => {
  it("matches exact prefix and nested paths", () => {
    expect(pathMatchesPrefix("/hub", "/hub")).toBe(true);
    expect(pathMatchesPrefix("/hub/x", "/hub")).toBe(true);
    expect(pathMatchesPrefix("/hub/", "/hub")).toBe(true);
  });

  it("does not match sibling paths that only share a startsWith prefix", () => {
    // Raw pathname.startsWith("/hub") would incorrectly allow /hub-fake.
    expect(pathMatchesPrefix("/hub-fake", "/hub")).toBe(false);
    expect(pathMatchesPrefix("/workspaces-old", "/workspaces")).toBe(false);
    expect(pathMatchesPrefix("/accountancy", "/account")).toBe(false);
  });
});

describe("middleware session gate", () => {
  function run(path: string, cookie?: string) {
    const headers = cookie ? { cookie } : undefined;
    const req = new NextRequest(new URL(path, "http://127.0.0.1:3005"), {
      headers,
    });
    return middleware(req);
  }

  it("redirects protected /whats-new without session", () => {
    const res = run("/whats-new");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("next=%2Fwhats-new");
  });

  it("allows protected paths with dang_web_session", () => {
    const res = run("/spaces", "dang_web_session=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("protects classic /group and /daily-ledger without session", () => {
    for (const path of ["/group", "/daily-ledger", "/proposals", "/onboarding"]) {
      const res = run(path);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
      expect(res.headers.get("location")).toContain(`next=${encodeURIComponent(path)}`);
    }
  });

  it("redirects authenticated /onboarding to /spaces/new", () => {
    const res = run("/onboarding", "dang_web_session=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/spaces/new");
  });

  it("redirects authenticated /profile to /account", () => {
    const res = run("/profile", "dang_session=abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/account");
  });

  it("does not treat /hub-fake as a protected /hub path", () => {
    const res = run("/hub-fake");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
