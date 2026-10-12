import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { AuthController } from "./auth.controller.js";
import {
  isCredentialAccount,
  SESSION_COOKIE,
  authModeForUser,
  type AccountRecord,
} from "./account.types.js";

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    userId: "user-1",
    externalSubject: "dev-local-user",
    email: null,
    emailVerifiedAt: null,
    displayName: "کاربر محلی",
    passwordHash: null,
    avatarUrl: null,
    locale: "fa-IR",
    timezone: "Asia/Tehran",
    username: null,
    phone: null,
    phoneHash: null,
    phoneVerifiedAt: null,
    platformRole: "user",
    displayUnit: null,
    usernameChangedAt: null,
    disabledAt: null,
    disabledByUserId: null,
    disabledReason: null,
    totpSecret: null,
    totpEnabledAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function actor(userId: string, subject: string): AuthActor {
  return {
    userId,
    externalSubject: subject,
    displayName: subject,
    authMode: "dev",
  };
}

test("auth mode treats password and email accounts as credentials, not dev", () => {
  const password = account({
    externalSubject: "local:a@example.com",
    email: "a@example.com",
    passwordHash: "hash",
  });
  const oidc = account({
    userId: "oidc-user",
    externalSubject: "idp-sub",
    email: "o@idp.test",
  });
  const dev = account();
  assert.equal(authModeForUser(password), "password");
  assert.equal(authModeForUser(oidc), "oidc");
  assert.equal(authModeForUser(dev), "dev");
  assert.equal(isCredentialAccount(password), true);
  assert.equal(isCredentialAccount(oidc), true);
  assert.equal(isCredentialAccount(dev), false);
  assert.equal(
    isCredentialAccount(account({ email: null, emailVerifiedAt: new Date() })),
    true,
  );
});

test("dev bootstrap keeps a password or OIDC cookie and still swaps a dev cookie", async () => {
  const prevNode = process.env.NODE_ENV;
  const prevAllow = process.env.ALLOW_DEV_AUTH;
  process.env.NODE_ENV = "development";
  process.env.ALLOW_DEV_AUTH = "true";

  const password = account({
    userId: "pw-user",
    externalSubject: "local:a@example.com",
    email: "a@example.com",
    passwordHash: "hash",
  });
  const oidc = account({
    userId: "oidc-user",
    externalSubject: "idp-sub",
    email: "o@idp.test",
  });
  const dev = account({ userId: "dev-user", externalSubject: "dev-local-user" });

  const sessions = new Map<string, AccountRecord>([
    ["pw-token", password],
    ["oidc-token", oidc],
    ["dev-token", dev],
  ]);
  const bySubject = new Map<string, AccountRecord>([
    [password.externalSubject, password],
    [oidc.externalSubject, oidc],
    [dev.externalSubject, dev],
  ]);

  const upserts: string[] = [];
  const issued: string[] = [];
  const iam = {
    async upsertDevActor(input: { externalSubject: string; displayName: string }) {
      upserts.push(input.externalSubject);
      return actor("minted", input.externalSubject);
    },
  };
  const accounts = {
    async findSessionAccount(token: string | undefined) {
      if (!token) return null;
      return sessions.get(token) ?? null;
    },
    async findAccountBySubject(subject: string) {
      return bySubject.get(subject) ?? null;
    },
    async issueSessionForUser(userId: string) {
      issued.push(userId);
    },
  };
  const controller = new AuthController(iam as never, accounts as never);

  const call = (cookie: string | undefined, subject: string) =>
    controller.bootstrapDevSession(
      {
        headers: {
          "x-dang-subject": subject,
          "x-dang-display-name": "Swapped",
        },
        cookies: cookie ? { [SESSION_COOKIE]: cookie } : {},
        ip: "127.0.0.1",
      } as never,
      {} as never,
    );

  try {
    upserts.length = 0;
    issued.length = 0;
    assert.deepEqual(await call("pw-token", "attacker"), { ok: true });
    assert.deepEqual(upserts, []);
    assert.deepEqual(issued, []);

    assert.deepEqual(await call("oidc-token", "attacker"), { ok: true });
    assert.deepEqual(upserts, []);
    assert.deepEqual(issued, []);

    assert.deepEqual(await call("dev-token", "local:a@example.com"), { ok: true });
    assert.deepEqual(upserts, []);
    assert.deepEqual(issued, []);

    assert.deepEqual(await call("dev-token", "other-dev"), { ok: true });
    assert.deepEqual(upserts, ["other-dev"]);
    assert.deepEqual(issued, ["minted"]);

    upserts.length = 0;
    issued.length = 0;
    assert.deepEqual(await call(undefined, "fresh-dev"), { ok: true });
    assert.deepEqual(upserts, ["fresh-dev"]);
    assert.deepEqual(issued, ["minted"]);
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) delete process.env.ALLOW_DEV_AUTH;
    else process.env.ALLOW_DEV_AUTH = prevAllow;
  }
});

test("dev bootstrap stays hidden in production", async () => {
  const prevNode = process.env.NODE_ENV;
  const prevAllow = process.env.ALLOW_DEV_AUTH;
  process.env.NODE_ENV = "production";
  process.env.ALLOW_DEV_AUTH = "true";
  let upserts = 0;
  const controller = new AuthController(
    {
      async upsertDevActor() {
        upserts += 1;
        return actor("x", "x");
      },
    } as never,
    {
      async findSessionAccount() {
        return null;
      },
      async findAccountBySubject() {
        return null;
      },
      async issueSessionForUser() {
        throw new Error("must not issue");
      },
    } as never,
  );

  try {
    await assert.rejects(
      () =>
        controller.bootstrapDevSession(
          { headers: { "x-dang-subject": "attacker" }, cookies: {}, ip: "127.0.0.1" } as never,
          {} as never,
        ),
      (err: unknown) => err instanceof NotFoundException,
    );
    assert.equal(upserts, 0);
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAllow === undefined) delete process.env.ALLOW_DEV_AUTH;
    else process.env.ALLOW_DEV_AUTH = prevAllow;
  }
});
