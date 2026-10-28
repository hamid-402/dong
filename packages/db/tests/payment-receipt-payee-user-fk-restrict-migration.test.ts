/**
 * File checks for migration 0100 + optional DB-level ON DELETE RESTRICT (23001).
 *
 * Does not read .env — set DATABASE_URL in the process environment to exercise
 * the live check. Cursor / run 17 must not apply this migration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  createDatabase,
  eq,
  membership,
  paymentReceipt,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0100_payment_receipt_payee_user_fk_restrict.sql",
);

test("0100 recreates payee_user FK with ON DELETE RESTRICT NOT VALID", () => {
  const raw = readFileSync(migrationPath, "utf8");
  const migration = raw.replace(/--[^\n]*/g, "");
  assert.match(migration, /payment_receipt_payee_user_fk_restrict/);
  assert.match(
    migration,
    /FOREIGN KEY \("payee_user_id"\) REFERENCES "iam"\."user_account"\("id"\)/,
  );
  assert.match(migration, /ON DELETE RESTRICT/i);
  assert.match(migration, /NOT VALID/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS "payment_receipt_payee_user_fk"/,
  );
  assert.doesNotMatch(migration, /VALIDATE\s+CONSTRAINT/i);
});

test("0100 is registered in the Drizzle migration journal", () => {
  const journal = readFileSync(
    resolve(process.cwd(), "migrations/meta/_journal.json"),
    "utf8",
  );
  assert.match(journal, /0100_payment_receipt_payee_user_fk_restrict/);
});

test("0100 payee_user FK RESTRICT blocks user delete (23001)", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip(
      "DATABASE_URL not set — skip payee_user FK RESTRICT (no .env load)",
    );
    return;
  }

  const { db, pool, close } = createDatabase(databaseUrl);
  t.after(async () => {
    await close();
  });

  const fkProbe = await pool.query<{ confdeltype: string }>(`
    select c.confdeltype
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'finance'
      and c.conname = 'payment_receipt_payee_user_fk_restrict'
      and c.contype = 'f'
  `);
  if (!fkProbe.rows[0]) {
    t.skip("payment_receipt_payee_user_fk_restrict (0100) not applied yet");
    return;
  }
  assert.equal(
    fkProbe.rows[0].confdeltype,
    "r",
    "payee_user FK must be ON DELETE RESTRICT (0100)",
  );

  const payerId = crypto.randomUUID();
  const payeeId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();

  await db.insert(userAccount).values([
    {
      id: payerId,
      externalSubject: `rcpt-payer-${payerId}`,
      displayName: "Payer",
    },
    {
      id: payeeId,
      externalSubject: `rcpt-payee-${payeeId}`,
      displayName: "Payee",
    },
  ]);

  await withTenantContext(db, { workspaceId, userId: payerId }, async (tx) => {
    await tx.insert(workspace).values({
      id: workspaceId,
      slug: `rcpt-pu-${workspaceId.slice(0, 8)}`,
      name: "Payee user RESTRICT WS",
      template: "friends_family",
      createdBy: payerId,
    });
    await tx.insert(membership).values({
      workspaceId,
      userId: payerId,
      role: "owner",
    });
    await tx.insert(paymentReceipt).values({
      id: receiptId,
      workspaceId,
      payerUserId: payerId,
      payeeUserId: payeeId,
      method: "card_to_card",
      amountMinor: 7000n,
      paidAt: new Date(),
      idempotencyKey: `rcpt-payee-user-${receiptId}`,
    });
  });

  await assert.rejects(
    () => db.delete(userAccount).where(eq(userAccount.id, payeeId)),
    (err: unknown) => {
      const withCause = err as { cause?: { code?: string }; code?: string };
      const code = withCause.cause?.code ?? withCause.code;
      assert.equal(code, "23001");
      return true;
    },
  );

  const still = await db
    .select()
    .from(userAccount)
    .where(eq(userAccount.id, payeeId));
  assert.equal(still.length, 1, "payee user must remain after RESTRICT");
});
