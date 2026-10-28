import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCookieSecure } from "@dang/config";
import { clearSessionCookies, sessionCookieSecure } from "./session-cookie.js";

describe("resolveCookieSecure / sessionCookieSecure", () => {
  it("production → secure true (unset flag)", () => {
    const r = resolveCookieSecure("production", undefined);
    assert.equal(r.secure, true);
    assert.equal(r.forcedInProduction, false);
  });

  it("COOKIE_SECURE=1 in non-production → secure true", () => {
    const r = resolveCookieSecure("development", "1");
    assert.equal(r.secure, true);
    assert.equal(r.forcedInProduction, false);
    assert.equal(
      sessionCookieSecure(
        { nodeEnv: "development" } as never,
        "true",
      ),
      true,
    );
  });

  it("development without flag → secure false", () => {
    const r = resolveCookieSecure("development", undefined);
    assert.equal(r.secure, false);
    assert.equal(r.forcedInProduction, false);
    const testEnv = resolveCookieSecure("test", "");
    assert.equal(testEnv.secure, false);
  });

  it("COOKIE_SECURE=0 in production → secure still true + forced flag", () => {
    const r = resolveCookieSecure("production", "0");
    assert.equal(r.secure, true);
    assert.equal(r.forcedInProduction, true);
    const rFalse = resolveCookieSecure("production", "false");
    assert.equal(rFalse.secure, true);
    assert.equal(rFalse.forcedInProduction, true);
  });

  it("COOKIE_SECURE=0 outside production → secure false", () => {
    assert.equal(resolveCookieSecure("development", "0").secure, false);
    assert.equal(resolveCookieSecure("test", "false").secure, false);
  });
});

describe("clearSessionCookies uses Secure from env-driven flag", () => {
  it("clears dang_session, dang_csrf, dang_reauth with matching secure", () => {
    const cleared: Array<{ name: string; options: Record<string, unknown> }> =
      [];
    clearSessionCookies({
      setCookie: () => undefined,
      clearCookie: (name, options) => {
        cleared.push({ name, options: options ?? {} });
      },
    });
    assert.equal(cleared.length, 3);
    assert.deepEqual(
      cleared.map((c) => c.name).sort(),
      ["dang_csrf", "dang_reauth", "dang_session"],
    );
    for (const entry of cleared) {
      assert.equal(typeof entry.options.secure, "boolean");
      assert.equal(entry.options.path, "/");
      assert.equal(entry.options.sameSite, "lax");
    }
  });
});
