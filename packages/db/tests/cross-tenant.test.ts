/**
 * Cross-tenant RLS smoke test.
 *
 * Skips when DATABASE_URL is unset. After local migrate + grants, run:
 *   pnpm --filter @dang/db test
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  and,
  createDatabase,
  eq,
  isNull,
  membership,
  userAccount,
  withTenantContext,
  workspace,
  workspaceDay,
  workspaceRangeLock,
} from "../src/index.ts";

/** Load repo-root .env so `pnpm --filter @dang/db test` sees DATABASE_URL. */
function loadRepoEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../.env"),
  ];
  for (const filePath of candidates) {
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

describe("cross-tenant RLS", () => {
  it("isolates workspace rows between tenants", async (t) => {
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
      select current_user,
             r.rolsuper,
             r.rolbypassrls
      from pg_roles r
      where r.rolname = current_user
    `);
    const probe = roleProbe.rows[0];
    if (!probe || probe.rolsuper || probe.rolbypassrls) {
      assert.fail(
        `cross-tenant test must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
      );
    }

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `cross-tenant-a-${userA}`,
        displayName: "Tenant A",
      },
      {
        id: userB,
        externalSubject: `cross-tenant-b-${userB}`,
        displayName: "Tenant B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `ws-a-${workspaceA.slice(0, 8)}`,
        name: "Workspace A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `ws-b-${workspaceB.slice(0, 8)}`,
        name: "Workspace B",
        template: "small_team",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
    });

    const seenByA = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceB)),
    );

    assert.equal(seenByA.length, 0, "tenant A must not read workspace B");

    const seenOwn = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceA)),
    );

    assert.equal(seenOwn.length, 1);
  });

  it("isolates workspace_day and workspace_range_lock", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { db, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `day-lock-a-${userA}`,
        displayName: "Day Lock A",
      },
      {
        id: userB,
        externalSubject: `day-lock-b-${userB}`,
        displayName: "Day Lock B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `day-a-${workspaceA.slice(0, 8)}`,
        name: "Day WS A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
      await tx.insert(workspaceDay).values({
        workspaceId: workspaceA,
        dayOn: "2026-09-01",
        isHoliday: false,
        updatedByUserId: userA,
      });
      await tx.insert(workspaceRangeLock).values({
        workspaceId: workspaceA,
        rangeStart: "2026-09-01",
        rangeEnd: "2026-09-30",
        idempotencyKey: `lock-${workspaceA.slice(0, 8)}`,
        lockedByUserId: userA,
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `day-b-${workspaceB.slice(0, 8)}`,
        name: "Day WS B",
        template: "small_team",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
    });

    const daysSeenByB = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx
          .select({ workspaceId: workspaceDay.workspaceId })
          .from(workspaceDay)
          .where(eq(workspaceDay.workspaceId, workspaceA)),
    );
    assert.equal(daysSeenByB.length, 0, "tenant B must not read workspace_day of A");

    const locksSeenByB = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx
          .select({ id: workspaceRangeLock.id })
          .from(workspaceRangeLock)
          .where(
            and(
              eq(workspaceRangeLock.workspaceId, workspaceA),
              isNull(workspaceRangeLock.unlockedAt),
            ),
          ),
    );
    assert.equal(locksSeenByB.length, 0, "tenant B must not read range_lock of A");

    const daysOwn = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx
          .select({ workspaceId: workspaceDay.workspaceId })
          .from(workspaceDay)
          .where(eq(workspaceDay.workspaceId, workspaceA)),
    );
    assert.equal(daysOwn.length, 1);
  });
});
