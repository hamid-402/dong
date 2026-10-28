import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { signLocalPspIntent } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { CsrfGuard } from "./csrf.guard.js";
import { SESSION_COOKIE } from "./account.types.js";
import { MemoryPaymentStore, PAYMENT_STORE } from "../payments/payment.store.js";

const CSRF_COOKIE = "dang_csrf";
const CSRF_HEADER = "x-csrf-token";

function run(
  method: string,
  cookies: Record<string, string | undefined>,
  headers: Record<string, string | undefined> = {},
  extras: {
    url?: string;
    body?: { sig?: string };
    moduleRef?: { get: (token: unknown, opts?: { strict?: boolean }) => unknown };
  } = {},
) {
  const guard = new CsrfGuard(extras.moduleRef as never);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        url: extras.url,
        cookies,
        headers,
        body: extras.body,
      }),
    }),
  };
  return guard.canActivate(context as never);
}

test("CSRF skips safe methods", async () => {
  assert.equal(await run("GET", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "t" }), true);
});

test("CSRF skips when no session cookie", async () => {
  assert.equal(await run("POST", { [CSRF_COOKIE]: "t" }, { [CSRF_HEADER]: "t" }), true);
});

test("CSRF accepts matching double-submit", async () => {
  assert.equal(
    await run("POST", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "token-a" }, { [CSRF_HEADER]: "token-a" }),
    true,
  );
});

test("CSRF rejects missing or mismatched token", async () => {
  await assert.rejects(
    () => run("POST", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" }, { [CSRF_HEADER]: "b" }),
    ForbiddenException,
  );
  await assert.rejects(
    () => run("DELETE", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" }, {}),
    ForbiddenException,
  );
});

test("CSRF allows dev bootstrap only when no session cookie is present", async () => {
  const guard = new CsrfGuard();
  const open = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/api/v1/auth/dev/bootstrap-session",
        cookies: {},
        headers: { "x-dang-subject": "dev-local-user" },
      }),
    }),
  };
  assert.equal(await guard.canActivate(open as never), true);

  const withSession = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/api/v1/auth/dev/bootstrap-session",
        cookies: { [SESSION_COOKIE]: "live-session" },
        headers: { "x-dang-subject": "dev-local-user" },
      }),
    }),
  };
  await assert.rejects(() => guard.canActivate(withSession as never), ForbiddenException);

  const withToken = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/api/v1/auth/dev/bootstrap-session",
        cookies: { [SESSION_COOKIE]: "live-session", [CSRF_COOKIE]: "token-b" },
        headers: { [CSRF_HEADER]: "token-b" },
      }),
    }),
  };
  assert.equal(await guard.canActivate(withToken as never), true);
});

test("CSRF exempts auth login even with stale session cookie", async () => {
  assert.equal(
    await run(
      "POST",
      { [SESSION_COOKIE]: "stale-session" },
      {},
      { url: "/api/v1/auth/login" },
    ),
    true,
  );
});

test("CSRF auth exemption allows when Origin and Referer are both absent", async () => {
  assert.equal(
    await run(
      "POST",
      { [SESSION_COOKIE]: "stale" },
      {},
      { url: "/api/v1/auth/register" },
    ),
    true,
  );
});

test("CSRF auth exemption allows localhost Origin from app CORS config", async () => {
  const env = loadAppEnv();
  assert.equal(
    await run(
      "POST",
      {},
      { origin: env.webOrigin },
      { url: "/api/v1/auth/login" },
    ),
    true,
  );
  assert.equal(
    await run(
      "POST",
      {},
      { origin: "http://127.0.0.1:3005" },
      { url: "/api/v1/auth/logout" },
    ),
    true,
  );
  assert.equal(
    await run(
      "POST",
      {},
      { referer: "http://localhost:3005/login" },
      { url: "/api/v1/auth/forgot-password" },
    ),
    true,
  );
});

test("CSRF auth exemption rejects foreign Origin", async () => {
  await assert.rejects(
    () =>
      run(
        "POST",
        { [SESSION_COOKIE]: "s" },
        { origin: "https://evil.example" },
        { url: "/api/v1/auth/login" },
      ),
    ForbiddenException,
  );
});

test("CSRF auth exemption rejects foreign Referer when Origin absent", async () => {
  await assert.rejects(
    () =>
      run(
        "POST",
        {},
        { referer: "https://evil.example/phish" },
        { url: "/api/v1/auth/reset-password" },
      ),
    ForbiddenException,
  );
});

test("CSRF still enforces on non-auth mutations with session", async () => {
  await assert.rejects(
    () =>
      run(
        "POST",
        { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" },
        {},
        { url: "/api/v1/workspaces/x/expenses" },
      ),
    ForbiddenException,
  );
});

test("CSRF enforces PUT payout-instructions with session", async () => {
  await assert.rejects(
    () =>
      run(
        "PUT",
        { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" },
        {},
        { url: "/api/v1/workspaces/x/payout-instructions" },
      ),
    ForbiddenException,
  );
  assert.equal(
    await run(
      "PUT",
      { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "token-p" },
      { [CSRF_HEADER]: "token-p" },
    ),
    true,
  );
});

test("CSRF enforces DELETE payout-instructions with session", async () => {
  await assert.rejects(
    () =>
      run("DELETE", { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" }, { [CSRF_HEADER]: "b" }),
    ForbiddenException,
  );
  assert.equal(
    await run(
      "DELETE",
      { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "token-d" },
      { [CSRF_HEADER]: "token-d" },
    ),
    true,
  );
});

test("LocalPSP verify with valid HMAC is CSRF-exempt even with session", async () => {
  const store = new MemoryPaymentStore();
  const intentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const amountMinor = "12000";
  await store.savePendingLocalPsp({
    intentId,
    amountMinor,
    description: "csrf-hmac",
    returnUrl: "https://dang.local/r",
    workspaceId,
    expiresAt,
  });
  const sig = signLocalPspIntent({
    secret: loadAppEnv().sessionSecret,
    intentId,
    workspaceId,
    amountMinor,
    expiresAt,
  });
  const moduleRef = {
    get: (token: unknown) => (token === PAYMENT_STORE ? store : undefined),
  };

  assert.equal(
    await run(
      "POST",
      { [SESSION_COOKIE]: "s" },
      {},
      {
        url: `/api/v1/payments/local/intents/${intentId}/verify`,
        body: { sig },
        moduleRef,
      },
    ),
    true,
  );
});

test("LocalPSP verify with invalid HMAC enforces CSRF (403)", async () => {
  const store = new MemoryPaymentStore();
  const intentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await store.savePendingLocalPsp({
    intentId,
    amountMinor: "1000",
    description: "bad-hmac",
    returnUrl: "https://dang.local/r",
    workspaceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const moduleRef = {
    get: (token: unknown) => (token === PAYMENT_STORE ? store : undefined),
  };

  await assert.rejects(
    () =>
      run(
        "POST",
        { [SESSION_COOKIE]: "s", [CSRF_COOKIE]: "a" },
        {},
        {
          url: `/api/v1/payments/local/intents/${intentId}/verify`,
          body: { sig: "0".repeat(64) },
          moduleRef,
        },
      ),
    ForbiddenException,
  );
});
