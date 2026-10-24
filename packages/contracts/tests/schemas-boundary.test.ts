import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaymentLinkRequestSchema,
  loginRequestSchema,
} from "../src/schemas/index.js";
import { assertRejection } from "./assert-rejection.js";

test("valid auth login passes", () => {
  const result = loginRequestSchema.safeParse({
    email: "user@example.com",
    password: "secret-password",
  });
  assert.equal(result.success, true);
});

test("login with username identifier passes schema", () => {
  const result = loginRequestSchema.safeParse({
    identifier: "hamid.kazemi",
    password: "secret-password",
  });
  assert.equal(result.success, true);
});

test("login without email or identifier fails", () => {
  assertRejection(
    loginRequestSchema.safeParse({
      password: "secret-password",
    }),
    { message: "Provide email or identifier" },
  );
});

test("payment link with bad amount fails", () => {
  assertRejection(
    createPaymentLinkRequestSchema.safeParse({
      workspaceId: "ws-1",
      amount: { amountMinor: "-100", currency: "IRR" },
      description: "settle",
      returnUrl: "https://example.com/return",
      idempotencyKey: "pay-1",
    }),
    { path: ["amount", "amountMinor"], message: "amount_FORMAT" },
  );
});
