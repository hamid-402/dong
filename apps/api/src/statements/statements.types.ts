import type {
  CreateStatementExportRequest,
  StatementExportSummary,
} from "@dang/contracts";

export type StatementExportRecord = StatementExportSummary & {
  body?: string;
  mimeType?: string;
  fileName?: string;
  /** ISO expiry — body may be cleared after this. */
  expiresAt?: string;
};

export type StatementsExportStore = {
  readonly persistence: "memory" | "postgres";
  create(
    input: StatementExportSummary & {
      body: string;
      mimeType: string;
      fileName: string;
      expiresAt?: string;
    },
  ): Promise<StatementExportRecord>;
  get(
    workspaceId: string,
    exportId: string,
    actorUserId: string,
  ): Promise<StatementExportRecord | null>;
  /**
   * Purge expired export bodies (additive retention).
   * Returns number of rows whose body was cleared.
   */
  purgeExpiredBodies(nowIso?: string): Promise<number>;
  /** Count rows that would be purged by {@link purgeExpiredBodies} (dry-run). */
  countExpiredBodies(nowIso?: string): Promise<number>;
};

export const STATEMENTS_EXPORT_STORE = Symbol("STATEMENTS_EXPORT_STORE");

export type { CreateStatementExportRequest };
