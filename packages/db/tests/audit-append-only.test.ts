/**
 * R10-04 — audit.event is append-only for runtime (privilege + RLS).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  auditEvent,
  createDatabase,
  eq,
  membership,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

function loadRepoEnv(): void {
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
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadRepoEnv();
const databaseUrl = process.env.DATABASE_URL;

describe("audit append-only (R10-04)", () => {
  it("keeps audit.event immutable for runtime role", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { db, pool, close } = createDatabase(databaseUrl);
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
        `must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
      );
    }

    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();

    await db.insert(userAccount).values({
      id: userId,
      externalSubject: `audit-immut-${userId}`,
      displayName: "Audit Immut",
    });

    let eventId = "";
    await withTenantContext(db, { workspaceId, userId }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceId,
        slug: `aim-${workspaceId.slice(0, 8)}`,
        name: "Audit Immut WS",
        template: "friends_family",
        createdBy: userId,
      });
      await tx.insert(membership).values({
        workspaceId,
        userId,
        role: "owner",
      });
      const inserted = await tx
        .insert(auditEvent)
        .values({
          workspaceId,
          actorUserId: userId,
          action: "test.append",
          targetType: "test",
          result: "success",
          metadata: {},
        })
        .returning({ id: auditEvent.id });
      eventId = inserted[0]?.id ?? "";
    });
    assert.ok(eventId);

    const priv = await pool.query<{ can_update: boolean; can_delete: boolean }>(`
      select
        has_table_privilege(current_user, 'audit.event', 'UPDATE') as can_update,
        has_table_privilege(current_user, 'audit.event', 'DELETE') as can_delete
    `);

    if (priv.rows[0]?.can_update || priv.rows[0]?.can_delete) {
      // Fallback when revoke not yet applied: FORCE RLS has no UPDATE/DELETE policy → 0 rows.
      await withTenantContext(db, { workspaceId, userId }, async (tx) => {
        await tx
          .update(auditEvent)
          .set({ action: "tampered" })
          .where(eq(auditEvent.id, eventId));
        await tx.delete(auditEvent).where(eq(auditEvent.id, eventId));
      });
    } else {
      await assert.rejects(
        () =>
          pool.query(`UPDATE audit.event SET action = 'tampered' WHERE id = $1`, [
            eventId,
          ]),
        /permission denied/i,
      );
      await assert.rejects(
        () => pool.query(`DELETE FROM audit.event WHERE id = $1`, [eventId]),
        /permission denied/i,
      );
    }

    const still = await withTenantContext(
      db,
      { workspaceId, userId },
      async (tx) =>
        tx
          .select({ action: auditEvent.action })
          .from(auditEvent)
          .where(eq(auditEvent.id, eventId)),
    );
    assert.equal(still.length, 1);
    assert.equal(still[0]?.action, "test.append");
  });
});
