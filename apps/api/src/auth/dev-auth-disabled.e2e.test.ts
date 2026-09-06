import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { SessionAuthGuard } from "./auth.guard.js";

/**
 * Locks in: even if ALLOW_DEV_AUTH=true, production must ignore x-dang-subject.
 * Uses a minimal request/context stand-in (no full Nest bootstrap).
 */
test("dev auth header is ignored in production even when ALLOW_DEV_AUTH=true", async () => {
  const prevNode = process.env.NODE_ENV;
  const prevAllow = process.env.ALLOW_DEV_AUTH;
  process.env.NODE_ENV = "production";
  process.env.ALLOW_DEV_AUTH = "true";

  try {
    const env = loadAppEnv();
    assert.equal(env.nodeEnv, "production");
    assert.equal(env.allowDevAuth, true);

    const accounts = {
      resolveSessionActor: async () => null,
    };
    const iam = {
      upsertDevActor: async () => {
        throw new Error("dev auth must not run in production");
      },
    };

    const guard = new SessionAuthGuard(iam as never, accounts as never);
    const request = {
      headers: { "x-dang-subject": "attacker" },
      cookies: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await assert.rejects(
      () => guard.canActivate(context as never),
      (err: unknown) => err instanceof UnauthorizedException,
    );
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) delete process.env.ALLOW_DEV_AUTH;
    else process.env.ALLOW_DEV_AUTH = prevAllow;
  }
});

test("dev auth is allowed outside production when ALLOW_DEV_AUTH=true", async () => {
  const prevNode = process.env.NODE_ENV;
  const prevAllow = process.env.ALLOW_DEV_AUTH;
  process.env.NODE_ENV = "development";
  process.env.ALLOW_DEV_AUTH = "true";

  try {
    const accounts = {
      resolveSessionActor: async () => null,
    };
    const iam = {
      upsertDevActor: async () => ({
        userId: "u1",
        externalSubject: "attacker",
        displayName: "attacker",
        authMode: "dev",
      }),
    };
    const guard = new SessionAuthGuard(iam as never, accounts as never);
    const request: {
      headers: Record<string, string>;
      cookies: Record<string, string>;
      dangActor?: unknown;
    } = {
      headers: { "x-dang-subject": "attacker" },
      cookies: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };
    const ok = await guard.canActivate(context as never);
    assert.equal(ok, true);
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) delete process.env.ALLOW_DEV_AUTH;
    else process.env.ALLOW_DEV_AUTH = prevAllow;
  }
});
