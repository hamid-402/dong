import assert from "node:assert/strict";
import test from "node:test";
import * as OTPAuth from "otpauth";
import { MfaService } from "./mfa.service.js";
import { MemoryAccountStore } from "./memory-account.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { hashPassword } from "./password.js";

function makeMfaService() {
  const accounts = new MemoryAccountStore();
  const iam = new MemoryIamStore();
  const mfa = new MfaService(accounts, iam);
  return { accounts, iam, mfa };
}

test("TOTP verifyToken accepts current code within window", () => {
  const { mfa } = makeMfaService();
  const secret = mfa.generateSecret();
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const code = totp.generate();
  assert.equal(mfa.verifyToken(secret, code), true);
  assert.equal(mfa.verifyToken(secret, "000000"), false);
});

test("login challenge path: MFA enabled returns challenge without session", async () => {
  const { accounts, iam, mfa } = makeMfaService();
  const passwordHash = await hashPassword("StrongPass1!");
  const user = await accounts.createLocalUser({
    email: "mfa-owner@example.com",
    displayName: "MFA Owner",
    passwordHash,
  });
  await iam.createWorkspace({
    actorUserId: user.userId,
    name: "Team",
    slug: `team-${user.userId.slice(0, 8)}`,
    template: "small_team",
  });

  const secret = mfa.generateSecret();
  await accounts.setTotpSecret(user.userId, secret);
  await accounts.enableTotp(user.userId);

  const challengeId = mfa.createChallenge(user.userId);
  assert.ok(challengeId.length > 10);

  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const code = totp.generate();

  let cookieSet = false;
  const reply = {
    setCookie: () => {
      cookieSet = true;
    },
  };

  const result = await mfa.verifyChallenge(
    { challengeId, code },
    reply,
  );
  assert.equal(result.ok, true);
  assert.equal(result.profile.mfaEnabled, true);
  assert.equal(cookieSet, true);
});

test("userNeedsMfaEnrollment true for owner without MFA", async () => {
  const { accounts, iam, mfa } = makeMfaService();
  const passwordHash = await hashPassword("StrongPass1!");
  const user = await accounts.createLocalUser({
    email: "needs-mfa@example.com",
    displayName: "Needs MFA",
    passwordHash,
  });
  await iam.createWorkspace({
    actorUserId: user.userId,
    name: "Space",
    slug: `space-${user.userId.slice(0, 8)}`,
    template: "friends_family",
  });
  assert.equal(await mfa.userNeedsMfaEnrollment(user.userId), true);

  const secret = mfa.generateSecret();
  await accounts.setTotpSecret(user.userId, secret);
  await accounts.enableTotp(user.userId);
  assert.equal(await mfa.userNeedsMfaEnrollment(user.userId), false);
});
