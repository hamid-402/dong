import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProductionBootSafety,
  resolveSupportContactEmail,
  type AppEnv,
} from "@dang/config";

function baseEnv(over: Partial<AppEnv> = {}): AppEnv {
  return {
    nodeEnv: "development",
    webOrigin: "http://localhost:3005",
    apiPort: 3006,
    apiBaseUrl: "http://localhost:3006/api/v1",
    allowDevAuth: true,
    requireMfa: false,
    sessionSecret: "dev-only-session-secret-change-me",
    ...over,
  };
}

describe("assertProductionBootSafety", () => {
  it("allows development with weak secret", () => {
    assert.doesNotThrow(() => assertProductionBootSafety(baseEnv()));
  });

  it("rejects production weak session secret", () => {
    assert.throws(
      () =>
        assertProductionBootSafety(
          baseEnv({
            nodeEnv: "production",
            allowDevAuth: false,
            sessionSecret: "dev-only-session-secret-change-me",
          }),
        ),
      /SESSION_SECRET/,
    );
  });

  it("rejects production ALLOW_DEV_AUTH", () => {
    assert.throws(
      () =>
        assertProductionBootSafety(
          baseEnv({
            nodeEnv: "production",
            allowDevAuth: true,
            sessionSecret: "a".repeat(40),
          }),
        ),
      /ALLOW_DEV_AUTH/,
    );
  });

  it("allows production with strong secret and no dev auth", () => {
    assert.doesNotThrow(() =>
      assertProductionBootSafety(
        baseEnv({
          nodeEnv: "production",
          allowDevAuth: false,
          sessionSecret: "a".repeat(40),
        }),
      ),
    );
  });
});

describe("resolveSupportContactEmail", () => {
  it("returns null for missing or .local placeholders", () => {
    assert.equal(resolveSupportContactEmail({}), null);
    assert.equal(
      resolveSupportContactEmail({ SUPPORT_EMAIL: "support@dang.local" }),
      null,
    );
  });

  it("returns real inbox from CONTACT_INBOX", () => {
    assert.equal(
      resolveSupportContactEmail({ CONTACT_INBOX: "hello@dang.app" }),
      "hello@dang.app",
    );
  });
});
