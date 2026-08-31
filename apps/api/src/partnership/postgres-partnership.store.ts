import {
  agreement,
  and,
  contribution,
  createDatabase,
  eq,
  partnerLoan,
  periodLock,
  withTenantContext,
  withdrawal,
  type AppDatabase,
} from "@dang/db";
import type {
  AgreementSummary,
  ContributionSummary,
  CreateAgreementRequest,
  CreatePeriodLockRequest,
  MemberAccountReport,
  OwnershipShareSummary,
  PartnerLoanSummary,
  PeriodLockSummary,
  RecordContributionRequest,
  RecordPartnerLoanRequest,
  RecordWithdrawalRequest,
  WithdrawalSummary,
} from "@dang/contracts";
import type { PartnershipStore } from "./partnership.types.js";

function asDateString(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapAgreement(row: typeof agreement.$inferSelect): AgreementSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    version: Number(row.version),
    status: row.status,
    effectiveFrom: asDateString(row.effectiveFrom),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapContribution(row: typeof contribution.$inferSelect): ContributionSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agreementId: row.agreementId,
    memberUserId: row.memberUserId,
    kind: row.kind,
    amount:
      row.amountMinor != null
        ? { amountMinor: row.amountMinor.toString(), currency: "IRR" }
        : undefined,
    description: row.description ?? undefined,
    recordedAt: row.recordedAt.toISOString(),
  };
}

function mapLoan(row: typeof partnerLoan.$inferSelect): PartnerLoanSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agreementId: row.agreementId,
    lenderUserId: row.lenderUserId,
    borrowerUserId: row.borrowerUserId,
    principal: { amountMinor: row.principalMinor.toString(), currency: "IRR" },
    repaidMinor: row.repaidMinor.toString(),
    status: row.status,
    recordedAt: row.recordedAt.toISOString(),
  };
}

function mapWithdrawal(row: typeof withdrawal.$inferSelect): WithdrawalSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agreementId: row.agreementId,
    memberUserId: row.memberUserId,
    amount: { amountMinor: row.amountMinor.toString(), currency: "IRR" },
    reason: row.reason ?? undefined,
    recordedAt: row.recordedAt.toISOString(),
  };
}

function mapLock(row: typeof periodLock.$inferSelect): PeriodLockSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    periodStart: asDateString(row.periodStart),
    periodEnd: asDateString(row.periodEnd),
    reason: row.reason ?? undefined,
    lockedByUserId: row.lockedByUserId,
    lockedAt: row.lockedAt.toISOString(),
  };
}

export class PostgresPartnershipStore implements PartnershipStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresPartnershipStore {
    const { db } = createDatabase(connectionString);
    return new PostgresPartnershipStore(db);
  }

  createAgreement(
    actorUserId: string,
    input: CreateAgreementRequest,
  ): Promise<AgreementSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(agreement)
          .where(
            and(
              eq(agreement.workspaceId, input.workspaceId),
              eq(agreement.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapAgreement(existing[0]);

        const inserted = await tx
          .insert(agreement)
          .values({
            workspaceId: input.workspaceId,
            title: input.title.trim(),
            version: 1,
            status: "active",
            effectiveFrom: input.effectiveFrom,
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("AGREEMENT_INSERT_FAILED");
        return mapAgreement(row);
      },
    );
  }

  listAgreements(workspaceId: string): Promise<AgreementSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(agreement)
        .where(eq(agreement.workspaceId, workspaceId));
      return rows.map(mapAgreement);
    });
  }

  getAgreement(
    workspaceId: string,
    agreementId: string,
  ): Promise<AgreementSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(agreement)
        .where(and(eq(agreement.id, agreementId), eq(agreement.workspaceId, workspaceId)))
        .limit(1);
      return rows[0] ? mapAgreement(rows[0]) : undefined;
    });
  }

  async assertPeriodOpen(
    workspaceId: string,
    isoDate = new Date().toISOString(),
  ): Promise<void> {
    const day = isoDate.slice(0, 10);
    const locks = await this.listPeriodLocks(workspaceId);
    if (locks.some((l) => l.periodStart <= day && day <= l.periodEnd)) {
      throw new Error("PERIOD_LOCKED");
    }
  }

  createPeriodLock(
    actorUserId: string,
    input: CreatePeriodLockRequest,
  ): Promise<PeriodLockSummary> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)
    ) {
      return Promise.reject(new Error("PERIOD_DATE"));
    }
    if (input.periodStart > input.periodEnd) {
      return Promise.reject(new Error("PERIOD_RANGE"));
    }
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(periodLock)
          .where(
            and(
              eq(periodLock.workspaceId, input.workspaceId),
              eq(periodLock.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapLock(existing[0]);

        const inserted = await tx
          .insert(periodLock)
          .values({
            workspaceId: input.workspaceId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            reason: input.reason?.trim() || null,
            lockedByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("PERIOD_LOCK_INSERT_FAILED");
        return mapLock(row);
      },
    );
  }

  listPeriodLocks(workspaceId: string): Promise<PeriodLockSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(periodLock)
        .where(eq(periodLock.workspaceId, workspaceId));
      return rows.map(mapLock);
    });
  }

  async recordContribution(
    input: RecordContributionRequest,
  ): Promise<ContributionSummary> {
    if (!(await this.getAgreement(input.workspaceId, input.agreementId))) {
      throw new Error("AGREEMENT_NOT_FOUND");
    }
    await this.assertPeriodOpen(input.workspaceId);
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const inserted = await tx
        .insert(contribution)
        .values({
          workspaceId: input.workspaceId,
          agreementId: input.agreementId,
          memberUserId: input.memberUserId,
          kind: input.kind,
          amountMinor: input.amount ? BigInt(input.amount.amountMinor) : null,
          currency: "IRR",
          description: input.description?.trim() || null,
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("CONTRIBUTION_INSERT_FAILED");
      return mapContribution(row);
    });
  }

  listContributions(
    workspaceId: string,
    agreementId?: string,
  ): Promise<ContributionSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(contribution)
        .where(eq(contribution.workspaceId, workspaceId));
      return rows
        .filter((r) => !agreementId || r.agreementId === agreementId)
        .map(mapContribution);
    });
  }

  async recordLoan(input: RecordPartnerLoanRequest): Promise<PartnerLoanSummary> {
    if (!(await this.getAgreement(input.workspaceId, input.agreementId))) {
      throw new Error("AGREEMENT_NOT_FOUND");
    }
    await this.assertPeriodOpen(input.workspaceId);
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const inserted = await tx
        .insert(partnerLoan)
        .values({
          workspaceId: input.workspaceId,
          agreementId: input.agreementId,
          lenderUserId: input.lenderUserId,
          borrowerUserId: input.borrowerUserId,
          principalMinor: BigInt(input.principal.amountMinor),
          repaidMinor: 0n,
          currency: "IRR",
          status: "open",
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("LOAN_INSERT_FAILED");
      return mapLoan(row);
    });
  }

  async recordWithdrawal(input: RecordWithdrawalRequest): Promise<WithdrawalSummary> {
    if (!(await this.getAgreement(input.workspaceId, input.agreementId))) {
      throw new Error("AGREEMENT_NOT_FOUND");
    }
    await this.assertPeriodOpen(input.workspaceId);
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const inserted = await tx
        .insert(withdrawal)
        .values({
          workspaceId: input.workspaceId,
          agreementId: input.agreementId,
          memberUserId: input.memberUserId,
          amountMinor: BigInt(input.amount.amountMinor),
          currency: "IRR",
          reason: input.reason?.trim() || null,
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("WITHDRAWAL_INSERT_FAILED");
      return mapWithdrawal(row);
    });
  }

  async computeOwnershipShares(
    workspaceId: string,
    agreementId: string,
    memberNames: Map<string, string>,
  ): Promise<OwnershipShareSummary[]> {
    const totals = new Map<string, bigint>();
    for (const c of await this.listContributions(workspaceId, agreementId)) {
      if (c.kind === "cash" && c.amount) {
        const prev = totals.get(c.memberUserId) ?? 0n;
        totals.set(c.memberUserId, prev + BigInt(c.amount.amountMinor));
      }
    }
    const sum = [...totals.values()].reduce((a, b) => a + b, 0n);
    if (sum === 0n) return [];
    return [...totals.entries()].map(([memberUserId, minor]) => ({
      memberUserId,
      displayName: memberNames.get(memberUserId) ?? memberUserId,
      sharePercent: ((Number(minor) / Number(sum)) * 100).toFixed(2),
    }));
  }

  async buildMemberReport(
    workspaceId: string,
    memberUserId: string,
    displayName: string,
  ): Promise<MemberAccountReport> {
    const lines: MemberAccountReport["lines"] = [];
    let net = 0n;

    for (const c of await this.listContributions(workspaceId)) {
      if (c.memberUserId !== memberUserId || !c.amount) continue;
      net += BigInt(c.amount.amountMinor);
      lines.push({
        category: "contribution",
        label: c.description ?? `آورده ${c.kind}`,
        amountMinor: c.amount.amountMinor,
        currency: "IRR",
      });
    }

    const withdrawals = await withTenantContext(this.db, { workspaceId }, async (tx) =>
      tx.select().from(withdrawal).where(eq(withdrawal.workspaceId, workspaceId)),
    );
    for (const w of withdrawals) {
      if (w.memberUserId !== memberUserId) continue;
      const mapped = mapWithdrawal(w);
      net -= BigInt(mapped.amount.amountMinor);
      lines.push({
        category: "withdrawal",
        label: mapped.reason ?? "برداشت",
        amountMinor: mapped.amount.amountMinor,
        currency: "IRR",
      });
    }

    const loans = await withTenantContext(this.db, { workspaceId }, async (tx) =>
      tx.select().from(partnerLoan).where(eq(partnerLoan.workspaceId, workspaceId)),
    );
    for (const l of loans) {
      const mapped = mapLoan(l);
      const open = BigInt(mapped.principal.amountMinor) - BigInt(mapped.repaidMinor);
      if (mapped.lenderUserId === memberUserId) {
        net += open;
        lines.push({
          category: "loan",
          label: "قرض پرداخت‌شده",
          amountMinor: open.toString(),
          currency: "IRR",
        });
      }
      if (mapped.borrowerUserId === memberUserId) {
        net -= open;
        lines.push({
          category: "loan",
          label: "قرض دریافت‌شده",
          amountMinor: open.toString(),
          currency: "IRR",
        });
      }
    }

    return {
      workspaceId,
      memberUserId,
      displayName,
      lines,
      netPositionMinor: net.toString(),
    };
  }
}
