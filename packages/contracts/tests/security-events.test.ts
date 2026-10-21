import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeSecurityEventCursor,
  encodeSecurityEventCursor,
  securityEventDefaults,
  type SecurityEventName,
} from "../src/security-events.js";

const EXPECTED: Array<[SecurityEventName, string, string]> = [
  ["auth.login_failed", "auth", "medium"],
  ["auth.rate_limited", "auth", "high"],
  ["auth.password_changed", "auth", "high"],
  ["auth.session_revoked", "auth", "medium"],
  ["auth.sessions_revoked", "auth", "high"],
  ["auth.mfa_disabled", "auth", "high"],
  ["auth.mfa_enabled", "auth", "medium"],
  ["auth.mfa_challenge_failed", "auth", "medium"],
  ["auth.account_anonymized", "privacy", "high"],
  ["auth.reauth_ok", "auth", "info"],
  ["auth.reauth_failed", "auth", "medium"],
  ["access.maker_checker_denied", "access", "high"],
  ["access.policy_denied", "access", "medium"],
  ["access.break_glass_opened", "access", "critical"],
  ["access.break_glass_revoked", "access", "high"],
  ["fraud.settlement_anomaly", "fraud", "high"],
  ["fraud.invite_anomaly", "fraud", "high"],
  ["privacy.data_exported", "privacy", "info"],
  ["privacy.payout_destination_updated", "privacy", "medium"],
  ["privacy.payout_destination_cleared", "privacy", "medium"],
];

test("securityEventDefaults assigns category and severity for every named event", () => {
  for (const [name, category, severity] of EXPECTED) {
    assert.deepEqual(securityEventDefaults(name), { category, severity }, name);
  }
});

test("securityEventDefaults falls back to ops/info for unknown names", () => {
  assert.deepEqual(securityEventDefaults("unknown.thing" as SecurityEventName), {
    category: "ops",
    severity: "info",
  });
});

test("security event cursor round-trips including unicode ids", () => {
  const at = "2026-03-01T10:00:00.000Z";
  for (const id of ["evt-1", "رویداد-۱"]) {
    const cursor = encodeSecurityEventCursor(at, id);
    assert.match(cursor, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(decodeSecurityEventCursor(cursor), { t: at, id });
    assert.deepEqual(decodeSecurityEventCursor(`  ${cursor}  `), { t: at, id });
  }
});

test("decodeSecurityEventCursor rejects empty, malformed and wrong-shaped cursors", () => {
  assert.equal(decodeSecurityEventCursor(undefined), null);
  assert.equal(decodeSecurityEventCursor("   "), null);
  assert.equal(decodeSecurityEventCursor("12"), null); // legacy offset
  assert.equal(decodeSecurityEventCursor("!!!not-base64-json"), null);
  const wrong = Buffer.from(JSON.stringify({ t: 1, id: "x" }), "utf8").toString("base64url");
  assert.equal(decodeSecurityEventCursor(wrong), null);
  const missing = Buffer.from(JSON.stringify({ t: "a" }), "utf8").toString("base64url");
  assert.equal(decodeSecurityEventCursor(missing), null);
});
