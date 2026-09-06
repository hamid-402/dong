import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("hashPassword produces argon2id and verifies", async () => {
  const encoded = await hashPassword("StrongPass1!");
  assert.match(encoded, /^\$argon2id\$/);
  const result = await verifyPassword("StrongPass1!", encoded);
  assert.equal(result.valid, true);
  assert.equal(result.needsRehash, false);
});

test("legacy scrypt verifies and flags needsRehash", async () => {
  const { randomBytes, scrypt } = await import("node:crypto");
  const salt = randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt("LegacyPass99", salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  const encoded = [
    "scrypt",
    "16384",
    "8",
    "1",
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");

  const result = await verifyPassword("LegacyPass99", encoded);
  assert.equal(result.valid, true);
  assert.equal(result.needsRehash, true);

  const bad = await verifyPassword("wrong-password", encoded);
  assert.equal(bad.valid, false);
  assert.equal(bad.needsRehash, false);
});
