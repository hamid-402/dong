import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { CsrfGuard } from "./csrf.guard.js";
import { SESSION_COOKIE } from "./account.types.js";

const CSRF_COOKIE = "dang_csrf";
const CSRF_HEADER = "x-csrf-token";

function run(
  method: string,
  cookies: Record<string, string | undefined>,
  headers: Record<string, string | undefined> = {},
) {
  const guard = new CsrfGuard();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        cookies,
        headers,
      }),
    }),
  };
  return guard.canActivate(context as never);
}

test("CSRF skips safe methods", () => {
  assert.equal(run("GET", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "t" }), true);
});

test("CSRF skips when no session cookie", () => {
  assert.equal(run("POST", { [CSRF_COOKIE]: "t" }, { [CSRF_HEADER]: "t" }), true);
});

test("CSRF accepts matching double-submit", () => {
  assert.equal(
    run("POST", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "token-a" }, { [CSRF_HEADER]: "token-a" }),
    true,
  );
});

test("CSRF rejects missing or mismatched token", () => {
  assert.throws(
    () => run("POST", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" }, { [CSRF_HEADER]: "b" }),
    ForbiddenException,
  );
  assert.throws(
    () => run("DELETE", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" }, {}),
    ForbiddenException,
  );
});

test("CSRF exempts auth login even with stale session cookie", () => {
  const guard = new CsrfGuard();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/api/v1/auth/login",
        cookies: { [SESSION_COOKIE]: "stale-session" },
        headers: {},
      }),
    }),
  };
  assert.equal(guard.canActivate(context as never), true);
});

test("CSRF still enforces on non-auth mutations with session", () => {
  const guard = new CsrfGuard();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/api/v1/workspaces/x/expenses",
        cookies: { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" },
        headers: {},
      }),
    }),
  };
  assert.throws(() => guard.canActivate(context as never), ForbiddenException);
});

test("CSRF enforces PUT payout-instructions with session", () => {
  const guard = new CsrfGuard();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "PUT",
        url: "/api/v1/workspaces/x/payout-instructions",
        cookies: { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" },
        headers: {},
      }),
    }),
  };
  assert.throws(() => guard.canActivate(context as never), ForbiddenException);
  assert.equal(
    run(
      "PUT",
      { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "token-p" },
      { [CSRF_HEADER]: "token-p" },
    ),
    true,
  );
});

test("CSRF enforces DELETE payout-instructions with session", () => {
  assert.throws(
    () =>
      run("DELETE", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" }, { [CSRF_HEADER]: "b" }),
    ForbiddenException,
  );
  assert.equal(
    run(
      "DELETE",
      { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "token-d" },
      { [CSRF_HEADER]: "token-d" },
    ),
    true,
  );
});
