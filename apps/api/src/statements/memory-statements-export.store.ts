import type { StatementExportSummary } from "@dang/contracts";
import type { StatementExportRecord, StatementsExportStore } from "./statements.types.js";

export class MemoryStatementsExportStore implements StatementsExportStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, StatementExportRecord>();

  async create(
    input: StatementExportSummary & {
      body: string;
      mimeType: string;
      fileName: string;
      expiresAt?: string;
    },
  ): Promise<StatementExportRecord> {
    const row: StatementExportRecord = { ...input };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async get(
    workspaceId: string,
    exportId: string,
    _actorUserId: string,
  ): Promise<StatementExportRecord | null> {
    const row = this.rows.get(exportId);
    if (!row || row.workspaceId !== workspaceId) return null;
    if (row.expiresAt && row.expiresAt <= new Date().toISOString() && row.body) {
      const purged = { ...row, body: undefined, status: "failed" as const, errorDetail: "expired" };
      this.rows.set(exportId, purged);
      return { ...purged };
    }
    return { ...row };
  }

  async purgeExpiredBodies(nowIso = new Date().toISOString()): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.expiresAt && row.expiresAt <= nowIso && row.body) {
        this.rows.set(id, {
          ...row,
          body: undefined,
          status: "failed",
          errorDetail: row.errorDetail ?? "expired",
        });
        n += 1;
      }
    }
    return n;
  }

  async countExpiredBodies(nowIso = new Date().toISOString()): Promise<number> {
    let n = 0;
    for (const row of this.rows.values()) {
      if (row.expiresAt && row.expiresAt <= nowIso && row.body) n += 1;
    }
    return n;
  }
}
