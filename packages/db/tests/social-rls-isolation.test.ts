/**
 * Social RLS two-user isolation (migration 0092).
 *
 * Skips when DATABASE_URL is unset. Requires NOBYPASSRLS runtime role.
 * Does not read .env — set DATABASE_URL in the process environment to run.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contactSyncRun,
  createDatabase,
  eq,
  friendship,
  sql,
  userAccount,
  userDirectorySetting,
  withTenantContext,
} from "../src/index.ts";

const databaseUrl = process.env.DATABASE_URL;

describe("social RLS isolation", () => {
  it("keeps directory, friendship, and sync rows private across users", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set — skip social RLS isolation (no .env load)");
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
        `social RLS test must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
      );
    }

    const rlsProbe = await pool.query<{ rls: boolean; force: boolean }>(`
      select c.relrowsecurity as rls, c.relforcerowsecurity as force
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'social' and c.relname = 'user_directory_setting'
    `);
    if (!rlsProbe.rows[0]?.rls || !rlsProbe.rows[0]?.force) {
      t.skip("social RLS migration 0092 not applied yet");
      return;
    }

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const userC = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `social-rls-a-${userA}`,
        displayName: "Social A",
      },
      {
        id: userB,
        externalSubject: `social-rls-b-${userB}`,
        displayName: "Social B",
      },
      {
        id: userC,
        externalSubject: `social-rls-c-${userC}`,
        displayName: "Social C",
      },
    ]);

    await withTenantContext(db, { userId: userA }, async (tx) => {
      await tx.insert(userDirectorySetting).values({
        userId: userA,
        findableByUsername: false,
      });
      await tx.insert(contactSyncRun).values({
        userId: userA,
        submittedCount: 3,
        matchedCount: 1,
        source: "manual",
      });
    });

    const bSeesSettings = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx
        .select()
        .from(userDirectorySetting)
        .where(eq(userDirectorySetting.userId, userA));
    });
    assert.equal(bSeesSettings.length, 0, "B must not SELECT A's directory settings");

    const bUpdate = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx
        .update(userDirectorySetting)
        .set({ findableByUsername: true, updatedAt: new Date() })
        .where(eq(userDirectorySetting.userId, userA))
        .returning();
    });
    assert.equal(bUpdate.length, 0, "B must not UPDATE A's directory settings");

    const bSeesRuns = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx.select().from(contactSyncRun).where(eq(contactSyncRun.userId, userA));
    });
    assert.equal(bSeesRuns.length, 0, "B must not SELECT A's contact_sync_run");

    const bDeleteRuns = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx.delete(contactSyncRun).where(eq(contactSyncRun.userId, userA)).returning();
    });
    assert.equal(bDeleteRuns.length, 0, "B must not DELETE A's contact_sync_run");

    const friendshipId = crypto.randomUUID();
    const pairKey = userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
    await withTenantContext(db, { userId: userA }, async (tx) => {
      await tx.insert(friendship).values({
        id: friendshipId,
        requesterUserId: userA,
        addresseeUserId: userB,
        pairKey,
        status: "pending",
      });
    });

    const aSees = await withTenantContext(db, { userId: userA }, async (tx) => {
      return tx.select().from(friendship).where(eq(friendship.id, friendshipId));
    });
    const bSees = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx.select().from(friendship).where(eq(friendship.id, friendshipId));
    });
    const cSees = await withTenantContext(db, { userId: userC }, async (tx) => {
      return tx.select().from(friendship).where(eq(friendship.id, friendshipId));
    });
    assert.equal(aSees.length, 1, "A (party) sees friendship");
    assert.equal(bSees.length, 1, "B (party) sees friendship");
    assert.equal(cSees.length, 0, "C must not see A-B friendship");

    const cUpdate = await withTenantContext(db, { userId: userC }, async (tx) => {
      return tx
        .update(friendship)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(eq(friendship.id, friendshipId))
        .returning();
    });
    assert.equal(cUpdate.length, 0, "C must not UPDATE A-B friendship");

    const emptyGuc = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select
          set_config('app.user_id', '', true),
          set_config('app.workspace_id', '', true)
      `);
      return tx.select().from(userDirectorySetting).where(eq(userDirectorySetting.userId, userA));
    });
    assert.equal(emptyGuc.length, 0, "empty app.user_id must see no social rows under FORCE RLS");
  });
});
