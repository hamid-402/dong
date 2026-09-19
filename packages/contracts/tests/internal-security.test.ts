import assert from "node:assert/strict";
import test from "node:test";
import {
  isSealedTotpSecret,
  openTotpSecret,
  openTotpSecretWithKeyring,
  resolveInternalJobSecrets,
  resolveSecretsProviderMode,
  resolveTotpEncryptionKey,
  resolveTotpEncryptionKeyring,
  sealTotpSecret,
  signInternalJobPayload,
  verifyInternalJobAuth,
  verifyInternalJobPayload,
} from "../src/index.js";

test("TOTP seal/open round-trip", () => {
  const key = resolveTotpEncryptionKey({ SESSION_SECRET: "unit-test-session-secret" });
  const plain = "JBSWY3DPEHPK3PXP";
  const sealed = sealTotpSecret(plain, key);
  assert.equal(isSealedTotpSecret(sealed), true);
  assert.equal(openTotpSecret(sealed, key), plain);
});

test("TOTP open accepts legacy plaintext", () => {
  const key = resolveTotpEncryptionKey({ SESSION_SECRET: "unit-test-session-secret" });
  assert.equal(openTotpSecret("JBSWY3DPEHPK3PXP", key), "JBSWY3DPEHPK3PXP");
});

test("TOTP keyring decrypts with previous key during rotation", () => {
  const oldKey = resolveTotpEncryptionKey({
    TOTP_ENCRYPTION_KEY: "a".repeat(64),
  });
  const newKey = resolveTotpEncryptionKey({
    TOTP_ENCRYPTION_KEY: "b".repeat(64),
  });
  const plain = "JBSWY3DPEHPK3PXP";
  const sealedWithOld = sealTotpSecret(plain, oldKey);
  const keyring = resolveTotpEncryptionKeyring({
    TOTP_ENCRYPTION_KEY: "b".repeat(64),
    TOTP_ENCRYPTION_KEY_PREVIOUS: "a".repeat(64),
  });
  assert.equal(keyring.current.equals(newKey), true);
  assert.equal(openTotpSecretWithKeyring(sealedWithOld, keyring), plain);
  assert.equal(
    openTotpSecretWithKeyring(sealTotpSecret(plain, newKey), keyring),
    plain,
  );
});

test("internal job HMAC accepts valid payload and rejects skew", () => {
  const secret = "job-secret";
  const ts = Date.now();
  const signature = signInternalJobPayload({
    secret,
    ts,
    workspaceId: "ws-1",
    actorUserId: "user-1",
  });
  assert.equal(
    verifyInternalJobPayload({
      secret,
      ts,
      workspaceId: "ws-1",
      actorUserId: "user-1",
      signature,
    }),
    true,
  );
  assert.equal(
    verifyInternalJobPayload({
      secret,
      ts: ts - 10 * 60_000,
      workspaceId: "ws-1",
      actorUserId: "user-1",
      signature: signInternalJobPayload({
        secret,
        ts: ts - 10 * 60_000,
        workspaceId: "ws-1",
        actorUserId: "user-1",
      }),
      nowMs: ts,
    }),
    false,
  );
  assert.equal(
    verifyInternalJobPayload({
      secret,
      ts,
      workspaceId: "ws-other",
      actorUserId: "user-1",
      signature,
    }),
    false,
  );
});

test("internal job auth accepts previous token during rotation", () => {
  const current = "job-secret-new";
  const previous = "job-secret-old";
  const secrets = resolveInternalJobSecrets({
    DANG_INTERNAL_JOB_TOKEN: current,
    DANG_INTERNAL_JOB_TOKEN_PREVIOUS: previous,
  });
  const ts = Date.now();
  const signature = signInternalJobPayload({
    secret: previous,
    ts,
    workspaceId: "ws-1",
    actorUserId: "user-1",
  });
  assert.equal(
    verifyInternalJobAuth({
      secrets,
      suppliedToken: previous,
      ts,
      workspaceId: "ws-1",
      actorUserId: "user-1",
      signature,
    }),
    true,
  );
  assert.equal(
    resolveSecretsProviderMode({
      DANG_INTERNAL_JOB_TOKEN_PREVIOUS: previous,
    }),
    "env_with_rotation",
  );
  assert.equal(resolveSecretsProviderMode({}), "env");
  assert.equal(
    resolveSecretsProviderMode({}, { vaultStoreLive: true }),
    "local_vault_v1",
  );
});
