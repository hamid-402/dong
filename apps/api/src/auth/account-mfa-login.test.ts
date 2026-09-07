import assert from "node:assert/strict";
import test from "node:test";
import { AccountService } from "./account.service.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MailerService } from "./mailer.service.js";
import { MfaService } from "./mfa.service.js";
import { hashPassword } from "./password.js";

test("AccountService.login returns MFA challenge when TOTP enabled", async () => {
  const accounts = new MemoryAccountStore();
  const iam = new MemoryIamStore();
  const accountServiceStub = {
    async issueSessionForUser(
      userId: string,
      reply: { setCookie: (...args: unknown[]) => void },
      meta?: { ip?: string; userAgent?: string },
    ) {
      const { issueSessionCookie } = await import("./session-cookie.js");
      await issueSessionCookie(accounts, userId, reply as never, meta);
      await iam.ensurePersonalWorkspace(userId).catch(() => undefined);
    },
  };
  const mfa = new MfaService(accounts, iam, accountServiceStub as never);
  const mailer = new MailerService();
  const service = new AccountService(accounts, iam, mailer, mfa);

  const passwordHash = await hashPassword("StrongPass1!");
  const user = await accounts.createLocalUser({
    email: "challenge@example.com",
    displayName: "Challenge User",
    passwordHash,
  });
  const secret = mfa.generateSecret();
  await accounts.setTotpSecret(user.userId, secret);
  await accounts.enableTotp(user.userId);

  let cookieSet = false;
  const reply = {
    setCookie: () => {
      cookieSet = true;
    },
    clearCookie: () => undefined,
  };

  const result = await service.login(
    { email: "challenge@example.com", password: "StrongPass1!" },
    reply,
  );

  assert.equal("mfaRequired" in result && result.mfaRequired, true);
  assert.ok("challengeId" in result && typeof result.challengeId === "string");
  assert.equal(cookieSet, false);
});
