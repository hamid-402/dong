import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { createExpenseDraftSchema } from "@dang/contracts";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

const validBody = {
  title: "ناهار",
  total: { amountMinor: "10000", currency: "IRR" },
  paidByUserId: "alice",
  splitMethod: "equal",
  participantUserIds: ["alice", "bob"],
  occurredOn: "2026-09-01",
  idempotencyKey: "k-1",
};

test("ZodValidationPipe accepts valid expense draft", () => {
  const pipe = new ZodValidationPipe(createExpenseDraftSchema);
  const out = pipe.transform(validBody);
  assert.equal(out.title, "ناهار");
  assert.equal(out.total.amountMinor, "10000");
});

test("ZodValidationPipe rejects mass-assignment with 400", () => {
  const pipe = new ZodValidationPipe(createExpenseDraftSchema);
  assert.throws(
    () =>
      pipe.transform({
        ...validBody,
        status: "posted",
        ledgerEntryId: "forge-me",
      }),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const body = err.getResponse() as { status: number; title: string };
      assert.equal(body.status, 400);
      assert.equal(body.title, "Invalid request payload");
      return true;
    },
  );
});

test("ZodValidationPipe rejects non-positive amountMinor with 400", () => {
  const pipe = new ZodValidationPipe(createExpenseDraftSchema);
  assert.throws(
    () =>
      pipe.transform({
        ...validBody,
        total: { amountMinor: "-5", currency: "IRR" },
      }),
    (err: unknown) => err instanceof BadRequestException,
  );
});
