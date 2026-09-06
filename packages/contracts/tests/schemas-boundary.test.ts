import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaymentLinkRequestSchema,
  loginRequestSchema,
} from "../src/schemas/index.js";

test("valid auth login passes", () => {
  const result = loginRequestSchema.safeParse({
    email: "user@example.com",
    password: "secret-password",
  });
  assert.equal(result.success, true);
});

test("extra key on login fails", () => {
  const result = loginRequestSchema.safeParse({
    email: "user@example.com",
    password: "secret-password",
    role: "admin",
  });
  assert.equal(result.success, false);
});

test("payment link with bad amount fails", () => {
  const result = createPaymentLinkRequestSchema.safeParse({
    workspaceId: "ws-1",
    amount: { amountMinor: "-100", currency: "IRR" },
    description: "settle",
    returnUrl: "https://example.com/return",
    idempotencyKey: "pay-1",
  });
  assert.equal(result.success, false);
});
