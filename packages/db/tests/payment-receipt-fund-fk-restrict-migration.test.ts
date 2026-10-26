/**
 * File checks for migration 0097 + optional DB-level ON DELETE RESTRICT.
 *
 * DB delete runs as table owner (not dang_runtime). Does not read .env —
 * set DATABASE_URL in the process environment to exercise the live check.
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
  pettyCashFund,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0097_payment_receipt_payee_fund_fk_restrict.sql",
);

test("0097 recreates payee_fund workspace FK with ON DELETE RESTRICT", () => {
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "payment_receipt_payee_fund_fk"/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS "payment_receipt_payee_fund_workspace_fk"/,
  );
  assert.match(migration, /payment_receipt_payee_fund_workspace_fk/);
  assert.match(
    migration,
    /FOREIGN KEY \("workspace_id", "payee_fund_id"\)/,
  );
  assert.match(
    migration,
    /REFERENCES "finance"\."petty_cash_fund"\("workspace_id", "id"\)/,
  );
  assert.match(migration, /ON DELETE RESTRICT/i);
  assert.match(migration, /NOT VALID/);
});

test("0097 has no GRANT DELETE (and no DELETE privilege in any GRANT)", () => {
  const migration = readFileSync(migrationPath, "utf8");
  // Strip SQL line comments so prose cannot false-positive on GRANT/DELETE.
  const sql = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sql, /GRANT\s+DELETE\b/i);
  const grants = sql.match(/\bGRANT\b[^;]*/gi) ?? [];
  for (const grant of grants) {
    assert.doesNotMatch(
      grant,
      /\bDELETE\b/i,
      `0097 GRANT must not include DELETE: ${grant}`,
    );
  }
});

test("0097 is registered in the Drizzle migration journal", () => {
  const journal = readFileSync(
    resolve(process.cwd(), "migrations/meta/_journal.json"),
    "utf8",
  );
  assert.match(journal, /0097_payment_receipt_payee_fund_fk_restrict/);
  assert.match(journal, /0096_payment_receipt_payee_exactly_one/);
});

test("0097 payee_fund FK RESTRICT blocks fund delete (as table owner)", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip(
      "DATABASE_URL not set — skip payee_fund FK RESTRICT (no .env load)",
    );
    return;
  }

  const { db, pool, close } = createDatabase(databaseUrl);
  t.after(async () => {
    await close();
  });

  const ownerProbe = await pool.query<{
    current_user: string;
    table_owner: string;
    is_table_owner: boolean;
    rolsuper: boolean;
  }>(`
    select current_user::text as current_user,
           pg_get_userbyid(c.relowner)::text as table_owner,
           (current_user = pg_get_userbyid(c.relowner)) as is_table_owner,
           r.rolsuper
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.rolname = current_user
    where n.nspname = 'finance' and c.relname = 'petty_cash_fund'
  `);
  const probe = ownerProbe.rows[0];
  if (!probe) {
    t.skip("finance.petty_cash_fund not present yet");
    return;
  }
  if (probe.current_user === "dang_runtime") {
    t.skip(
      "fund RESTRICT delete must run as table owner, not dang_runtime",
    );
    return;
  }
  if (!probe.is_table_owner && !probe.rolsuper) {
    t.skip(
      `fund RESTRICT delete requires table owner (got ${probe.current_user}, owner=${probe.table_owner})`,
    );
    return;
  }

  const fkProbe = await pool.query<{ confdeltype: string }>(`
    select c.confdeltype
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'finance'
      and c.conname = 'payment_receipt_payee_fund_workspace_fk'
      and c.contype = 'f'
  `);
  if (!fkProbe.rows[0]) {
    t.skip("payment_receipt_payee_fund_workspace_fk (0097) not applied yet");
    return;
  }
  assert.equal(
    fkProbe.rows[0].confdeltype,
    "r",
    "payee_fund workspace FK must be ON DELETE RESTRICT (0097)",
  );

  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const fundId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();

  await db.insert(userAccount).values({
    id: userId,
    externalSubject: `rcpt-fund-del-${userId}`,
    displayName: "Fund delete",
  });

  await withTenantContext(db, { workspaceId, userId }, async (tx) => {
    await tx.insert(workspace).values({
      id: workspaceId,
      slug: `rcpt-fd-${workspaceId.slice(0, 8)}`,
      name: "Fund delete WS",
      template: "friends_family",
      createdBy: userId,
    });
    await tx.insert(membership).values({
      workspaceId,
      userId,
      role: "owner",
    });
    await tx.insert(pettyCashFund).values({
      id: fundId,
      workspaceId,
      name: "صندوق با رسید",
      custodianUserId: userId,
      openingBalanceMinor: 0n,
      createdByUserId: userId,
      idempotencyKey: `fund-del-${fundId}`,
    });
    await tx.insert(paymentReceipt).values({
      id: receiptId,
      workspaceId,
      payerUserId: userId,
      payeeFundId: fundId,
      method: "cash",
      amountMinor: 5000n,
      paidAt: new Date(),
      idempotencyKey: `rcpt-fund-del-${receiptId}`,
    });
  });

  await assert.rejects(
    () =>
      withTenantContext(db, { workspaceId, userId }, async (tx) =>
        tx.delete(pettyCashFund).where(eq(pettyCashFund.id, fundId)),
      ),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      assert.match(
        msg,
        /payment_receipt_payee_fund_workspace_fk|violates foreign key|restrict/i,
      );
      return true;
    },
  );

  const still = await withTenantContext(
    db,
    { workspaceId, userId },
    async (tx) =>
      tx.select().from(pettyCashFund).where(eq(pettyCashFund.id, fundId)),
  );
  assert.equal(still.length, 1, "fund must remain after RESTRICT");
});
