import {
  and,
  createDatabase,
  eq,
  expense,
  outing,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { CreateOutingRequest, OutingSummary } from "@dang/contracts";

export type OutingStore = {
  readonly persistence: "memory" | "postgres";
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateOutingRequest,
  ): Promise<OutingSummary>;
  list(workspaceId: string, actorUserId: string): Promise<OutingSummary[]>;
  get(
    workspaceId: string,
    outingId: string,
    actorUserId: string,
  ): Promise<OutingSummary | null>;
};

export const OUTING_STORE = Symbol("OUTING_STORE");

function formatOccurredOn(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

export class MemoryOutingStore implements OutingStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, OutingSummary & { idempotencyKey: string }>();

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateOutingRequest,
  ): Promise<OutingSummary> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === workspaceId && row.idempotencyKey === input.idempotencyKey) {
        return Promise.resolve(this.toSummary(row));
      }
    }
    const id = crypto.randomUUID();
    const stored = {
      id,
      workspaceId,
      title: input.title.trim(),
      note: input.note?.trim(),
      occurredOn: input.occurredOn,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      expenseIds: [] as string[],
      total: { amountMinor: "0", currency: "IRR" as const },
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.rows.set(id, stored);
    return Promise.resolve(this.toSummary(stored));
  }

  list(workspaceId: string, _actorUserId: string): Promise<OutingSummary[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .map((row) => this.toSummary(row)),
    );
  }

  get(
    workspaceId: string,
    outingId: string,
    _actorUserId: string,
  ): Promise<OutingSummary | null> {
    const row = this.rows.get(outingId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(this.toSummary(row));
  }

  private toSummary(
    row: OutingSummary & { idempotencyKey: string },
  ): OutingSummary {
    const { idempotencyKey: _, ...summary } = row;
    return summary;
  }
}

export class PostgresOutingStore implements OutingStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresOutingStore {
    const { db } = createDatabase(connectionString);
    return new PostgresOutingStore(db);
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateOutingRequest,
  ): Promise<OutingSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(outing)
          .where(
            and(
              eq(outing.workspaceId, workspaceId),
              eq(outing.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) {
          return this.mapOuting(tx, existing[0]);
        }
        const inserted = await tx
          .insert(outing)
          .values({
            workspaceId,
            title: input.title.trim(),
            note: input.note?.trim() || null,
            occurredOn: input.occurredOn,
            idempotencyKey: input.idempotencyKey.trim(),
            createdByUserId: actorUserId,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("OUTING_INSERT_FAILED");
        return this.mapOuting(tx, row);
      },
    );
  }

  async list(workspaceId: string, actorUserId: string): Promise<OutingSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(outing)
          .where(eq(outing.workspaceId, workspaceId));
        const result: OutingSummary[] = [];
        for (const row of rows) {
          result.push(await this.mapOuting(tx, row));
        }
        return result;
      },
    );
  }

  async get(
    workspaceId: string,
    outingId: string,
    actorUserId: string,
  ): Promise<OutingSummary | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(outing)
          .where(and(eq(outing.id, outingId), eq(outing.workspaceId, workspaceId)))
          .limit(1);
        if (!rows[0]) return null;
        return this.mapOuting(tx, rows[0]);
      },
    );
  }

  private async mapOuting(
    tx: AppDatabase,
    row: typeof outing.$inferSelect,
  ): Promise<OutingSummary> {
    const expenses = await tx
      .select()
      .from(expense)
      .where(eq(expense.outingId, row.id));
    let total = 0n;
    for (const item of expenses) {
      total += item.totalMinor;
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      note: row.note ?? undefined,
      occurredOn: formatOccurredOn(row.occurredOn),
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      expenseIds: expenses.map((item) => item.id),
      total: { amountMinor: total.toString(), currency: "IRR" },
    };
  }
}

export function createOutingStore(): OutingStore {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return PostgresOutingStore.fromConnectionString(databaseUrl);
  }
  return new MemoryOutingStore();
}
