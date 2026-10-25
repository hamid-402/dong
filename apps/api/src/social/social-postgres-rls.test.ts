/**
 * Postgres social directory under RLS (اجرای ۶).
 *
 * B finds A by username and sends a friend request while session stays B.
 * Negative: B must not SELECT A's full user_directory_setting row.
 *
 * Skips when DATABASE_URL is unset. Does not load .env — set DATABASE_URL
 * in the process environment (NOBYPASSRLS role, preferably dang_runtime).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabase,
  eq,
  userDirectorySetting,
  withTenantContext,
} from "@dang/db";
import { hashPassword } from "../auth/password.js";
import { PostgresAccountStore } from "../auth/postgres-account.store.js";
import { PostgresSocialStore } from "./postgres-social.store.js";
import { SocialService } from "./social.service.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

function actorOf(user: { userId: string; externalSubject: string; displayName: string }) {
  return {
    userId: user.userId,
    externalSubject: user.externalSubject,
    displayName: user.displayName,
    authMode: "password" as const,
  };
}

test("postgres B finds A by username and requests friendship under RLS", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL not set — skip social postgres B→A (no .env load)");
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
      `social B→A test must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
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

  const accounts = new PostgresAccountStore(db);
  const social = new PostgresSocialStore(db);
  const service = new SocialService(social, accounts);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const usernameA = `run6a${suffix}`;
  const usernameB = `run6b${suffix}`;

  const userA = await accounts.createLocalUser({
    email: `${usernameA}@example.com`,
    displayName: "Run6 A",
    passwordHash: await hashPassword("StrongPass1!"),
    username: usernameA,
    phone: `+98910${suffix.slice(0, 7)}`,
  });
  const userB = await accounts.createLocalUser({
    email: `${usernameB}@example.com`,
    displayName: "Run6 B",
    passwordHash: await hashPassword("StrongPass1!"),
    username: usernameB,
    phone: `+98911${suffix.slice(0, 7)}`,
  });

  await service.updatePrivacy(actorOf(userA), {
    findableByUsername: true,
    allowFriendRequests: true,
  });

  const found = await service.lookup(actorOf(userB), { username: usernameA });
  assert.ok(found, "B must find A by username when findableByUsername");
  assert.equal(found.userId, userA.userId);
  assert.equal(found.username, usernameA);

  const req = await service.requestFriend(actorOf(userB), {
    targetUserId: userA.userId,
  });
  assert.equal(req.status, "pending");
  assert.equal(req.outgoing, true);
  assert.equal(req.otherUser.userId, userA.userId);
});

test("postgres B cannot SELECT A's full user_directory_setting row", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL not set — skip social postgres negative SELECT (no .env load)");
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
      `social negative SELECT must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
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

  const accounts = new PostgresAccountStore(db);
  const social = new PostgresSocialStore(db);
  const service = new SocialService(social, accounts);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const usernameA = `run6na${suffix}`;
  const usernameB = `run6nb${suffix}`;

  const userA = await accounts.createLocalUser({
    email: `${usernameA}@example.com`,
    displayName: "Run6 Neg A",
    passwordHash: await hashPassword("StrongPass1!"),
    username: usernameA,
    phone: `+98912${suffix.slice(0, 7)}`,
  });
  const userB = await accounts.createLocalUser({
    email: `${usernameB}@example.com`,
    displayName: "Run6 Neg B",
    passwordHash: await hashPassword("StrongPass1!"),
    username: usernameB,
    phone: `+98913${suffix.slice(0, 7)}`,
  });

  await service.updatePrivacy(actorOf(userA), {
    findableByUsername: true,
    allowFriendRequests: true,
  });

  const bSees = await withTenantContext(db, { userId: userB.userId }, async (tx) => {
    return tx
      .select()
      .from(userDirectorySetting)
      .where(eq(userDirectorySetting.userId, userA.userId));
  });
  assert.equal(bSees.length, 0, "B must not SELECT A's full directory settings row");
});
