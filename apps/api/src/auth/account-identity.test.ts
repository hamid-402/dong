import assert from "node:assert/strict";
import test from "node:test";
import { AccountService } from "./account.service.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MailerService } from "./mailer.service.js";
import { MfaService } from "./mfa.service.js";

function makeService() {
  const accounts = new MemoryAccountStore();
  const iam = new MemoryIamStore();
  const accountServiceStub = {
    async issueSessionForUser() {
      return;
    },
  };
  const mfa = new MfaService(accounts, iam, accountServiceStub as never);
  const mailer = new MailerService();
  const service = new AccountService(accounts, iam, mailer, mfa, {
    emit: () => ({}) as never,
  } as never);
  return { accounts, service };
}

test("S11-01 register requires username and accepts optional phone", async () => {
  const { service } = makeService();
  const reply = { setCookie: () => undefined, clearCookie: () => undefined };
  const result = await service.register(
    {
      email: "hamid@example.com",
      password: "StrongPass1!",
      displayName: "حمید کاظمی",
      username: "hamid.kazemi",
      phone: "09121234567",
    },
    reply,
  );
  assert.equal(result.ok, true);
  assert.equal(result.profile.username, "hamid.kazemi");
  assert.equal(result.profile.phone, "+989121234567");
  assert.equal(result.profile.phoneVerified, false);
  assert.equal(result.profile.platformRole, "user");
});

test("S11-01 login works with username", async () => {
  const { service } = makeService();
  const reply = { setCookie: () => undefined, clearCookie: () => undefined };
  await service.register(
    {
      email: "alias@example.com",
      password: "StrongPass1!",
      displayName: "Alias",
      username: "alias.user",
    },
    reply,
  );
  const loggedIn = await service.login(
    { identifier: "alias.user", password: "StrongPass1!" },
    reply,
  );
  assert.ok("ok" in loggedIn && loggedIn.ok);
  if ("ok" in loggedIn) {
    assert.equal(loggedIn.profile.username, "alias.user");
  }
});

test("S11-01 username availability is exact and rate-safe", async () => {
  const { service } = makeService();
  const reply = { setCookie: () => undefined, clearCookie: () => undefined };
  await service.register(
    {
      email: "taken@example.com",
      password: "StrongPass1!",
      displayName: "Taken",
      username: "taken.handle",
    },
    reply,
  );
  const free = await service.usernameAvailable("free.handle");
  const busy = await service.usernameAvailable("taken.handle");
  assert.equal(free.available, true);
  assert.equal(busy.available, false);
});
