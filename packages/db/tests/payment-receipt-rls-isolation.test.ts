/**
 * payment_receipt RLS isolation across two workspaces (migration 0052+).
 *
 * Skips when DATABASE_URL is unset. Requires NOBYPASSRLS runtime role.
 * The fund-delete check runs as dang_runtime: SET ROLE when the session may,
 * otherwise DATABASE_RUNTIME_URL from the process or the repo .env.
 * Port 5437 is refused. Other keys in .env are not loaded.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  createDatabase,
  eq,
  membership,
  paymentReceipt,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const databaseUrl = process.env.DATABASE_URL;

function connectionPort(connectionString: string): string | null {
  try {
    return new URL(connectionString).port || "5432";
  } catch {
    return null;
  }
}

function readRuntimeDatabaseUrl(): string | undefined {
  const fromProcess = process.env.DATABASE_RUNTIME_URL?.trim();
  if (fromProcess) return fromProcess;
  for (const filePath of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../.env"),
  ]) {
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      if (trimmed.slice(0, eqIdx).trim() !== "DATABASE_RUNTIME_URL") continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      const url = value.trim();
      return url || undefined;
    }
  }
  return undefined;
}

async function openDangRuntimeClient(connectionString: string) {
  if (connectionPort(connectionString) !== "5432") return null;
  const db = createDatabase(connectionString);
  const client = await db.pool.connect();
  const finish = async () => {
    client.release();
    await db.close();
  };
  try {
    const who = await client.query<{ current_user: string }>(
      "select current_user",
    );
    if (who.rows[0]?.current_user !== "dang_runtime") {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE dang_runtime");
    } else {
      await client.query("BEGIN");
    }
    const switched = await client.query<{ current_user: string }>(
      "select current_user",
    );
    if (switched.rows[0]?.current_user !== "dang_runtime") {
      throw new Error("session is not dang_runtime");
    }
    return { client, close: finish };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    await finish();
    return null;
  }
}

describe("payment_receipt RLS isolation", () => {
  it("keeps select/update of receipts private across workspaces", async (t) => {
    const { db, pool, close } = createDatabase(databaseUrl!);
    t.after(async () => {
      await close();
    });

    const roleProbe = await pool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`
      select current_user, r.rolsuper, r.rolbypassrls
      from pg_roles r where r.rolname = current_user
    `);
    const probe = roleProbe.rows[0];
    if (!probe || probe.rolsuper || probe.rolbypassrls) {
      assert.fail(
        `payment_receipt RLS test must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
      );
    }

    const rlsProbe = await pool.query<{ rls: boolean; force: boolean }>(`
      select c.relrowsecurity as rls, c.relforcerowsecurity as force
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'finance' and c.relname = 'payment_receipt'
    `);
    if (!rlsProbe.rows[0]?.rls || !rlsProbe.rows[0]?.force) {
      t.skip("payment_receipt RLS (0052) not applied yet");
      return;
    }

    const payeeCol = await pool.query<{ exists: boolean }>(`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'finance'
          and table_name = 'payment_receipt'
          and column_name = 'payee_user_id'
      ) as exists
    `);
    const hasPayeeCol = Boolean(payeeCol.rows[0]?.exists);

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const receiptId = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `rcpt-rls-a-${userA}`,
        displayName: "Receipt A",
      },
      {
        id: userB,
        externalSubject: `rcpt-rls-b-${userB}`,
        displayName: "Receipt B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `rcpt-a-${workspaceA.slice(0, 8)}`,
        name: "Receipt WS A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
      await tx.insert(paymentReceipt).values({
        id: receiptId,
        workspaceId: workspaceA,
        payerUserId: userA,
        ...(hasPayeeCol ? { payeeUserId: userA } : {}),
        method: "cash",
        amountMinor: 10000n,
        paidAt: new Date(),
        idempotencyKey: `rcpt-rls-${receiptId}`,
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `rcpt-b-${workspaceB.slice(0, 8)}`,
        name: "Receipt WS B",
        template: "friends_family",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
    });

    const bSees = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx.select().from(paymentReceipt).where(eq(paymentReceipt.id, receiptId)),
    );
    assert.equal(bSees.length, 0, "workspace B must not SELECT A's payment_receipt");

    const bUpdate = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx
          .update(paymentReceipt)
          .set({ reviewNote: "cross-tenant" })
          .where(eq(paymentReceipt.id, receiptId))
          .returning(),
    );
    assert.equal(bUpdate.length, 0, "workspace B must not UPDATE A's payment_receipt");

    const aSees = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.select().from(paymentReceipt).where(eq(paymentReceipt.id, receiptId)),
    );
    assert.equal(aSees.length, 1, "workspace A still sees its own receipt");
  });

  it("حذف صندوق با dang_runtime با خطای permission رد می‌شه", async (t) => {
    const { pool, close } = createDatabase(databaseUrl!);
    t.after(async () => {
      await close();
    });

    const tableProbe = await pool.query<{ exists: boolean }>(`
      select exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'finance' and c.relname = 'petty_cash_fund'
      ) as exists
    `);
    if (!tableProbe.rows[0]?.exists) {
      t.skip("finance.petty_cash_fund not present yet");
      return;
    }

    const roleProbe = await pool.query<{ exists: boolean }>(`
      select exists (
        select 1 from pg_roles where rolname = 'dang_runtime'
      ) as exists
    `);
    if (!roleProbe.rows[0]?.exists) {
      t.skip("dang_runtime role not present");
      return;
    }

    const fundId = crypto.randomUUID();
    const runtimeUrl = readRuntimeDatabaseUrl();
    const opened =
      (await openDangRuntimeClient(databaseUrl!)) ??
      (runtimeUrl && runtimeUrl !== databaseUrl
        ? await openDangRuntimeClient(runtimeUrl)
        : null);
    if (!opened) {
      t.skip(
        "dang_runtime is not reachable via SET ROLE or DATABASE_RUNTIME_URL on port 5432",
      );
      return;
    }
    t.after(async () => {
      await opened.client.query("ROLLBACK").catch(() => undefined);
      await opened.close();
    });

    await assert.rejects(
      () =>
        opened.client.query(
          `DELETE FROM finance.petty_cash_fund WHERE id = $1`,
          [fundId],
        ),
      (err: unknown) => {
        const e = err as { code?: string; message?: string };
        assert.equal(e.code, "42501", "expected SQLSTATE 42501");
        assert.match(String(e.message ?? err), /permission denied/i);
        return true;
      },
    );
  });
});
