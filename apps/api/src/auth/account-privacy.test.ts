import assert from "node:assert/strict";
import test from "node:test";
import { accountDataExportSchema } from "@dang/contracts";
import { hashPassword } from "./password.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MailerService } from "./mailer.service.js";
import { MfaService } from "./mfa.service.js";
import { AccountService } from "./account.service.js";

function makeAccountService() {
  const accounts = new MemoryAccountStore();
  const iam = new MemoryIamStore();
  const accountServiceStub = {
    async issueSessionForUser() {
      return undefined;
    },
  };
  const mfa = new MfaService(accounts, iam, accountServiceStub as never);
  const mailer = new MailerService();
  const service = new AccountService(accounts, iam, mailer, mfa, {
    emit: () => ({}) as never,
  } as never);
  return { accounts, iam, service };
}

test("anonymizeAccount wipes PII and revokes sessions (R10-14)", async () => {
  const store = new MemoryAccountStore();
  const passwordHash = await hashPassword("TestPass123!");
  const user = await store.createLocalUser({
    email: "privacy@example.com",
    displayName: "کاربر تست",
    passwordHash,
    username: "privacy.user",
    phone: "+989121111111",
    phoneHash: "abc",
  });
  await store.createSession({
    userId: user.userId,
    tokenHash: "hash-a",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const anonymized = await store.anonymizeAccount(user.userId);
  assert.equal(anonymized.displayName, "حساب حذف‌شده");
  assert.equal(anonymized.passwordHash, null);
  assert.equal(anonymized.username, null);
  assert.equal(anonymized.phone, null);
  assert.equal(anonymized.phoneHash, null);
  assert.equal(anonymized.email, `deleted+${user.userId}@invalid.local`);
  assert.ok(anonymized.externalSubject.startsWith("deleted:"));
  assert.equal(await store.findByEmail("privacy@example.com"), null);

  const sessions = await store.listActiveSessions(user.userId);
  assert.equal(sessions.length, 0);
});

test("deleteMyAccount requires reauth then password", async () => {
  const { accounts, service } = makeAccountService();
  const password = "DeleteMe123!";
  const passwordHash = await hashPassword(password);
  const user = await accounts.createLocalUser({
    email: "anonymize-gate@example.com",
    displayName: "Anonymize Gate",
    passwordHash,
    username: "anonymize.gate",
  });
  const actor = {
    userId: user.userId,
    displayName: user.displayName,
    externalSubject: user.externalSubject,
    authMode: "password" as const,
  };
  let reauthCookie: string | undefined;
  const reply = {
    setCookie: (name: string, value: string) => {
      if (name === "dang_reauth") reauthCookie = value;
    },
    clearCookie: () => undefined,
  };

  await assert.rejects(
    () => service.deleteMyAccount(actor, { password, confirm: "DELETE" }, reply),
    (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 401,
  );

  await service.reauth(actor, { password }, reply);
  assert.ok(reauthCookie);

  await assert.rejects(
    () =>
      service.deleteMyAccount(
        actor,
        { password: "WrongPass999!", confirm: "DELETE" },
        reply,
        reauthCookie,
      ),
    (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 401,
  );

  const result = await service.deleteMyAccount(
    actor,
    { password, confirm: "DELETE" },
    reply,
    reauthCookie,
  );
  assert.equal(result.ok, true);
  assert.equal(result.anonymized, true);
  assert.equal(await accounts.findByEmail("anonymize-gate@example.com"), null);
});

test("exportMyData requires reauth and returns schemaVersion 1 without secrets", async () => {
  const { accounts, iam, service } = makeAccountService();
  const password = "ExportPass123!";
  const passwordHash = await hashPassword(password);
  const user = await accounts.createLocalUser({
    email: "export@example.com",
    displayName: "Export User",
    passwordHash,
    username: "export.user",
  });
  await iam.ensurePersonalWorkspace(user.userId);
  await accounts.createSession({
    userId: user.userId,
    tokenHash: "export-session-hash",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const actor = {
    userId: user.userId,
    displayName: user.displayName,
    externalSubject: user.externalSubject,
    authMode: "password" as const,
  };

  await assert.rejects(
    () => service.exportMyData(actor),
    (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 401,
  );

  let reauthCookie: string | undefined;
  const reply = {
    setCookie: (name: string, value: string) => {
      if (name === "dang_reauth") reauthCookie = value;
    },
    clearCookie: () => undefined,
  };
  await service.reauth(actor, { password }, reply);

  const exported = await service.exportMyData(actor, undefined, reauthCookie);
  const parsed = accountDataExportSchema.parse(exported);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.profile.email, "export@example.com");
  assert.ok(parsed.workspaces.length >= 1);
  assert.ok(parsed.notes.some((n) => /رمز|TOTP|password/i.test(n)));
  assert.ok(parsed.notes.some((n) => /R10-14/.test(n)));
  const blob = JSON.stringify(exported);
  assert.equal(blob.includes("passwordHash"), false);
  assert.equal(blob.includes("export-session-hash"), false);
  assert.equal(blob.includes("totpSecret"), false);
});
