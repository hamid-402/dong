import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor } from "@dang/contracts";
import { AccountService } from "./account.service.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { hashToken } from "./password.js";

const actor: AuthActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  externalSubject: "local:sessions@example.com",
  displayName: "Session Owner",
  authMode: "password",
};

function createService(store: MemoryAccountStore) {
  return new AccountService(store, {} as never, {} as never, {} as never);
}

test("session inventory exposes metadata but never token hashes", async () => {
  const store = new MemoryAccountStore();
  const rawToken = "current-secret-token";
  await store.createSession({
    userId: actor.userId,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
    ip: "127.0.0.1",
    userAgent: "Test Browser",
  });

  const sessions = await createService(store).listSessions(actor, rawToken);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.current, true);
  assert.equal(sessions[0]?.ip, "127.0.0.1");
  assert.equal("tokenHash" in (sessions[0] ?? {}), false);
});

test("selective revocation is scoped to the authenticated user", async () => {
  const store = new MemoryAccountStore();
  const own = await store.createSession({
    userId: actor.userId,
    tokenHash: hashToken("own-token"),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const other = await store.createSession({
    userId: "22222222-2222-4222-8222-222222222222",
    tokenHash: hashToken("other-token"),
    expiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal(await store.revokeSessionForUser(other.id, actor.userId), false);
  const result = await createService(store).revokeSession(actor, own.id, "own-token");
  assert.deepEqual(result, { ok: true, currentRevoked: true });
  assert.equal((await store.listActiveSessions(actor.userId)).length, 0);
  assert.equal((await store.listActiveSessions(other.userId)).length, 1);
});
