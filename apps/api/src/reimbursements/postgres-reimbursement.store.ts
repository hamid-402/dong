import { and, createDatabase, eq, reimbursementRequest, withTenantContext, type AppDatabase } from "@dang/db";
import type { CreateReimbursementRequest, ReimbursementStatus, ReimbursementSummary } from "@dang/contracts";
import type { ReimbursementStore } from "./reimbursements.types.js";

const map = (row: typeof reimbursementRequest.$inferSelect): ReimbursementSummary => ({
  id: row.id, workspaceId: row.workspaceId, expenseId: row.expenseId ?? undefined,
  claimantUserId: row.claimantUserId,
  amount: { amountMinor: row.amountMinor.toString(), currency: "IRR" },
  title: row.title, status: row.status as ReimbursementStatus, note: row.note ?? undefined,
  decidedBy: row.decidedBy ?? undefined, decidedAt: row.decidedAt?.toISOString(),
  paidAt: row.paidAt?.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export class PostgresReimbursementStore implements ReimbursementStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}
  static fromConnectionString(url: string) { return new PostgresReimbursementStore(createDatabase(url).db); }
  create(workspaceId: string, claimantUserId: string, input: CreateReimbursementRequest) {
    return withTenantContext(this.db, { workspaceId, userId: claimantUserId }, async (tx) => {
      const prior = await tx.select().from(reimbursementRequest).where(and(
        eq(reimbursementRequest.workspaceId, workspaceId),
        eq(reimbursementRequest.idempotencyKey, input.idempotencyKey.trim()),
      )).limit(1);
      if (prior[0]) return map(prior[0]);
      const rows = await tx.insert(reimbursementRequest).values({
        workspaceId, claimantUserId, expenseId: input.expenseId, amountMinor: BigInt(input.amountMinor),
        title: input.title.trim(), note: input.note?.trim(), idempotencyKey: input.idempotencyKey.trim(),
      }).returning();
      return map(rows[0]!);
    });
  }
  list(workspaceId: string, actorUserId: string) {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) =>
      (await tx.select().from(reimbursementRequest).where(eq(reimbursementRequest.workspaceId, workspaceId))).map(map));
  }
  get(workspaceId: string, id: string, actorUserId: string) {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx.select().from(reimbursementRequest).where(and(
        eq(reimbursementRequest.workspaceId, workspaceId), eq(reimbursementRequest.id, id),
      )).limit(1);
      return rows[0] ? map(rows[0]) : null;
    });
  }
  transition(workspaceId: string, id: string, actorUserId: string, from: readonly ReimbursementStatus[], to: ReimbursementStatus, note?: string) {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const current = await tx.select().from(reimbursementRequest).where(and(
        eq(reimbursementRequest.workspaceId, workspaceId), eq(reimbursementRequest.id, id),
      )).limit(1);
      if (!current[0]) throw new Error("REIMBURSEMENT_NOT_FOUND");
      if (!from.includes(current[0].status as ReimbursementStatus)) throw new Error("REIMBURSEMENT_STATUS");
      const now = new Date();
      const rows = await tx.update(reimbursementRequest).set({
        status: to, note: note?.trim() || current[0].note, updatedAt: now,
        ...(["approved", "rejected"].includes(to) ? { decidedBy: actorUserId, decidedAt: now } : {}),
        ...(to === "paid" ? { paidAt: now } : {}),
      }).where(and(eq(reimbursementRequest.id, id), eq(reimbursementRequest.status, current[0].status))).returning();
      if (!rows[0]) throw new Error("REIMBURSEMENT_STATUS");
      return map(rows[0]);
    });
  }
}
