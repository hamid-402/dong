/**
 * Migration 0101 FORCE RLS file checks + live app-role CRUD on tagged tables.
 *
 * Does not read .env — set DATABASE_URL (app / dang_migrator role) to run live.
 * Cursor / run 17 must not apply this migration; if live checks fail, Kara
 * should not apply 0101.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  agreedPrice,
  agreement,
  createDatabase,
  eq,
  expenseTag,
  guestPlaceholder,
  membership,
  userAccount,
  withTenantContext,
  workspace,
  workspaceSplitPreset,
  workspaceSplitPresetLine,
} from "../src/index.ts";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0101_force_rls_g03_g04_g10.sql",
);

const FORCE_TABLES = [
  { schema: "finance", table: "expense_tag" },
  { schema: "finance", table: "expense_tag_link" },
  { schema: "finance", table: "workspace_split_preset" },
  { schema: "finance", table: "workspace_split_preset_line" },
  { schema: "iam", table: "guest_placeholder" },
  { schema: "partnership", table: "agreed_price" },
] as const;

describe("0101 FORCE RLS file checks", () => {
  it("forces RLS on the six G03/G04/G10 tables", () => {
    const raw = readFileSync(migrationPath, "utf8");
    const migration = raw.replace(/--[^\n]*/g, "");
    for (const { schema, table } of FORCE_TABLES) {
      assert.match(
        migration,
        new RegExp(
          `ALTER TABLE "${schema}"\\."${table}" FORCE ROW LEVEL SECURITY`,
          "i",
        ),
      );
    }
  });

  it("is registered in the Drizzle migration journal", () => {
    const journal = readFileSync(
      resolve(process.cwd(), "migrations/meta/_journal.json"),
      "utf8",
    );
    assert.match(journal, /0101_force_rls_g03_g04_g10/);
  });
});

describe("0101 FORCE RLS live app-role paths", () => {
  it("app role can use expense tags, split presets, guest, agreed price", async (t) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set — skip 0101 live FORCE RLS (no .env load)");
      return;
    }

    const { db, pool, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    for (const { schema, table } of FORCE_TABLES) {
      const probe = await pool.query<{ rls: boolean; force: boolean }>(
        `
        select c.relrowsecurity as rls, c.relforcerowsecurity as force
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relname = $2
      `,
        [schema, table],
      );
      if (!probe.rows[0]?.rls || !probe.rows[0]?.force) {
        t.skip(`${schema}.${table} FORCE RLS (0101) not applied yet`);
        return;
      }
    }

    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const tagId = crypto.randomUUID();
    const presetId = crypto.randomUUID();
    const guestId = crypto.randomUUID();
    const agreementId = crypto.randomUUID();
    const priceId = crypto.randomUUID();

    await db.insert(userAccount).values({
      id: userId,
      externalSubject: `force-rls-${userId}`,
      displayName: "FORCE RLS",
    });

    await withTenantContext(db, { workspaceId, userId }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceId,
        slug: `frls-${workspaceId.slice(0, 8)}`,
        name: "FORCE RLS WS",
        template: "friends_family",
        createdBy: userId,
      });
      await tx.insert(membership).values({
        workspaceId,
        userId,
        role: "owner",
      });

      await tx.insert(expenseTag).values({
        id: tagId,
        workspaceId,
        name: "برچسب",
        slug: `tag-${tagId.slice(0, 8)}`,
        createdByUserId: userId,
      });
      const tags = await tx
        .select()
        .from(expenseTag)
        .where(eq(expenseTag.id, tagId));
      assert.equal(tags.length, 1);

      await tx.insert(workspaceSplitPreset).values({
        id: presetId,
        workspaceId,
        name: "پیش‌فرض",
        splitMethod: "equal",
        createdByUserId: userId,
        idempotencyKey: `preset-${presetId}`,
      });
      await tx.insert(workspaceSplitPresetLine).values({
        presetId,
        userId,
        shares: 1,
      });
      const presets = await tx
        .select()
        .from(workspaceSplitPreset)
        .where(eq(workspaceSplitPreset.id, presetId));
      assert.equal(presets.length, 1);
      const lines = await tx
        .select()
        .from(workspaceSplitPresetLine)
        .where(eq(workspaceSplitPresetLine.presetId, presetId));
      assert.equal(lines.length, 1);

      await tx.insert(guestPlaceholder).values({
        id: guestId,
        workspaceId,
        displayName: "مهمان",
        claimTokenHash: `hash-${guestId}`,
        createdByUserId: userId,
        idempotencyKey: `guest-${guestId}`,
      });
      const guests = await tx
        .select()
        .from(guestPlaceholder)
        .where(eq(guestPlaceholder.id, guestId));
      assert.equal(guests.length, 1);

      await tx.insert(agreement).values({
        id: agreementId,
        workspaceId,
        title: "قرارداد",
        effectiveFrom: "2026-01-01",
        createdByUserId: userId,
        idempotencyKey: `agr-${agreementId}`,
      });
      await tx.insert(agreedPrice).values({
        id: priceId,
        workspaceId,
        agreementId,
        title: "قیمت توافقی",
        amountMinor: 10000n,
        effectiveFrom: "2026-01-01",
        idempotencyKey: `price-${priceId}`,
      });
      const prices = await tx
        .select()
        .from(agreedPrice)
        .where(eq(agreedPrice.id, priceId));
      assert.equal(prices.length, 1);
    });
  });
});
