import {
  and,
  createDatabase,
  eq,
  sql,
  statementExport,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { StatementExportFormat, StatementExportStatus } from "@dang/contracts";
import type { StatementExportRecord, StatementsExportStore } from "./statements.types.js";

function formatDate(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function isExpired(expiresAt: string | undefined, nowIso: string): boolean {
  return Boolean(expiresAt && expiresAt <= nowIso);
}

export class PostgresStatementsExportStore implements StatementsExportStore {
  readonly persistence = "postgres" as const;

  private constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(databaseUrl: string): PostgresStatementsExportStore {
    const { db } = createDatabase(databaseUrl);
    return new PostgresStatementsExportStore(db);
  }

  async create(
    input: StatementExportRecord & {
      body: string;
      mimeType: string;
      fileName: string;
    },
  ): Promise<StatementExportRecord> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: input.requestedByUserId },
      async (tx) => {
        await tx.insert(statementExport).values({
          id: input.id,
          workspaceId: input.workspaceId,
          subjectUserId: input.subjectUserId,
          fromOn: input.from,
          toOn: input.to,
          format: input.format,
          status: input.status,
          rowCount: input.rowCount,
          body: input.body,
          mimeType: input.mimeType,
          fileName: input.fileName,
          requestedByUserId: input.requestedByUserId,
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
          errorDetail: input.errorDetail ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        });
        return { ...input };
      },
    );
  }

  async get(
    workspaceId: string,
    exportId: string,
    actorUserId: string,
  ): Promise<StatementExportRecord | null> {
    const nowIso = new Date().toISOString();
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(statementExport)
          .where(
            and(
              eq(statementExport.id, exportId),
              eq(statementExport.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        const expiresAt = row.expiresAt?.toISOString();
        const expired = isExpired(expiresAt, nowIso) && Boolean(row.body);
        if (expired) {
          await tx
            .update(statementExport)
            .set({
              body: null,
              status: "failed",
              errorDetail: row.errorDetail ?? "expired",
            })
            .where(eq(statementExport.id, exportId));
        }
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          subjectUserId: row.subjectUserId,
          from: formatDate(row.fromOn),
          to: formatDate(row.toOn),
          format: row.format as StatementExportFormat,
          status: (expired ? "failed" : row.status) as StatementExportStatus,
          rowCount: row.rowCount,
          downloadPath: `/workspaces/${row.workspaceId}/statements/exports/${row.id}/download`,
          requestedByUserId: row.requestedByUserId,
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString(),
          errorDetail: expired
            ? (row.errorDetail ?? "expired")
            : (row.errorDetail ?? undefined),
          body: expired ? undefined : (row.body ?? undefined),
          mimeType: row.mimeType ?? undefined,
          fileName: row.fileName ?? undefined,
          expiresAt,
        };
      },
    );
  }

  /**
   * Cross-tenant body purge. Effective when the DB role bypasses RLS
   * (e.g. dang_migrator); under dang_runtime FORCE RLS this returns 0 and
   * bodies still clear lazily in {@link get}.
   */
  async purgeExpiredBodies(nowIso?: string): Promise<number> {
    const now = nowIso ? new Date(nowIso) : new Date();
    const result = await this.db.execute(sql`
      UPDATE finance.statement_export
      SET
        body = NULL,
        status = 'failed',
        error_detail = COALESCE(error_detail, 'expired')
      WHERE expires_at IS NOT NULL
        AND expires_at <= ${now}
        AND body IS NOT NULL
    `);
    return Number((result as { rowCount?: number }).rowCount ?? 0);
  }

  async countExpiredBodies(nowIso?: string): Promise<number> {
    const now = nowIso ? new Date(nowIso) : new Date();
    const result = await this.db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM finance.statement_export
      WHERE expires_at IS NOT NULL
        AND expires_at <= ${now}
        AND body IS NOT NULL
    `);
    const rows = (result as { rows?: Array<{ n: number }> }).rows;
    return Number(rows?.[0]?.n ?? 0);
  }
}
