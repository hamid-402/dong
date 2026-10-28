import { createDatabase, sql } from "@dang/db";
import { createLogger } from "@dang/observability";

const logger = createLogger("dang-api-db-role");

/** App role expected for runtime (NOBYPASSRLS). Migrator is migrate-only. */
export const EXPECTED_RUNTIME_ROLE = "dang_runtime";

export type DbRoleProbeRow = {
  currentUser: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

export type DbRoleCheckStatus = "ok" | "warn" | "fail" | "skip";

export type DbRoleCheck = {
  status: DbRoleCheckStatus;
  currentUser?: string;
  reason?: string;
};

export function isDbRoleStrict(
  bag: NodeJS.ProcessEnv = process.env,
): boolean {
  return bag.DB_ROLE_STRICT === "1" || bag.DB_ROLE_STRICT?.toLowerCase() === "true";
}

/**
 * Assess whether the connected role is safe for app runtime.
 * Inappropriate: superuser, BYPASSRLS, or not dang_runtime.
 * Default is warn-only; fail only when `strict` is true.
 */
export function evaluateDbRoleCheck(
  probe: DbRoleProbeRow | null | undefined,
  options: { configured: boolean; strict: boolean },
): DbRoleCheck {
  if (!options.configured) {
    return { status: "skip" };
  }
  if (!probe) {
    return { status: "skip", reason: "probe_unavailable" };
  }

  const reasons: string[] = [];
  if (probe.rolsuper) reasons.push("superuser");
  if (probe.rolbypassrls) reasons.push("bypassrls");
  if (probe.currentUser !== EXPECTED_RUNTIME_ROLE) {
    reasons.push(`role=${probe.currentUser}`);
  }

  if (reasons.length === 0) {
    return { status: "ok", currentUser: probe.currentUser };
  }

  const reason = `db role not ready for app runtime (want ${EXPECTED_RUNTIME_ROLE} NOBYPASSRLS): ${reasons.join(",")}`;
  if (options.strict) {
    return {
      status: "fail",
      currentUser: probe.currentUser,
      reason,
    };
  }
  return {
    status: "warn",
    currentUser: probe.currentUser,
    reason,
  };
}

/**
 * Lightweight probe — never logs connection strings or secrets.
 * Returns null when the query fails (caller treats as skip).
 */
export async function probeDbRole(
  databaseUrl: string | undefined,
): Promise<DbRoleProbeRow | null> {
  if (!databaseUrl?.trim()) return null;
  try {
    const database = createDatabase(databaseUrl);
    const result = await database.db.execute(sql`
      select current_user as current_user,
             r.rolsuper as rolsuper,
             r.rolbypassrls as rolbypassrls
      from pg_roles r
      where r.rolname = current_user
    `);
    type Row = {
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    };
    const list =
      (result as unknown as { rows?: Row[] }).rows ??
      (Array.isArray(result) ? (result as Row[]) : []);
    const row = list[0];
    if (!row) return null;
    return {
      currentUser: String(row.current_user),
      rolsuper: Boolean(row.rolsuper),
      rolbypassrls: Boolean(row.rolbypassrls),
    };
  } catch {
    logger.warn("db role probe failed (non-fatal unless DB_ROLE_STRICT)");
    return null;
  }
}

export function logDbRoleCheck(check: DbRoleCheck): void {
  if (check.status === "warn") {
    logger.warn(check.reason ?? "db role warning", {
      currentUser: check.currentUser,
    });
  } else if (check.status === "fail") {
    logger.error(check.reason ?? "db role failed strict check", {
      currentUser: check.currentUser,
    });
  }
}
