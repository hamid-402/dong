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

type StoredAgreement = AgreementSummary & { idempotencyKey: string };
type StoredContribution = ContributionSummary & { idempotencyKey: string };
type StoredLoan = PartnerLoanSummary & { idempotencyKey: string };
type StoredWithdrawal = WithdrawalSummary & { idempotencyKey: string };
type StoredPeriodLock = PeriodLockSummary & { idempotencyKey: string };

function stripAgreement(row: StoredAgreement): AgreementSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    version: row.version,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

function stripLock(row: StoredPeriodLock): PeriodLockSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    reason: row.reason,
    lockedByUserId: row.lockedByUserId,
    lockedAt: row.lockedAt,
  };
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export class MemoryPartnershipStore implements PartnershipStore {
  readonly persistence = "memory" as const;
  private readonly agreements = new Map<string, StoredAgreement>();
  private readonly contributions = new Map<string, StoredContribution>();
  private readonly loans = new Map<string, StoredLoan>();
  private readonly withdrawals = new Map<string, StoredWithdrawal>();
  private readonly periodLocks = new Map<string, StoredPeriodLock>();

  createAgreement(
    actorUserId: string,
    input: CreateAgreementRequest,
  ): Promise<AgreementSummary> {
    const id = crypto.randomUUID();
    const row: StoredAgreement = {
      id,
      workspaceId: input.workspaceId,
      title: input.title.trim(),
      version: 1,
      status: "active",
      effectiveFrom: input.effectiveFrom,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.agreements.set(id, row);
    return Promise.resolve(stripAgreement(row));
  }

  listAgreements(workspaceId: string): Promise<AgreementSummary[]> {
    return Promise.resolve(
      [...this.agreements.values()]
        .filter((a) => a.workspaceId === workspaceId)
        .map(stripAgreement),
    );
  }

  getAgreement(
    workspaceId: string,
    agreementId: string,
  ): Promise<AgreementSummary | undefined> {
    const row = this.agreements.get(agreementId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(stripAgreement(row));
  }

  private isDateLocked(workspaceId: string, isoDate: string): boolean {
    const day = dayOf(isoDate);
    return [...this.periodLocks.values()].some(
      (lock) =>
        lock.workspaceId === workspaceId &&
        lock.periodStart <= day &&
        day <= lock.periodEnd,
    );
  }

  assertPeriodOpen(
    workspaceId: string,
    isoDate = new Date().toISOString(),
  ): Promise<void> {
    if (this.isDateLocked(workspaceId, isoDate)) {
      return Promise.reject(new Error("PERIOD_LOCKED"));
    }
    return Promise.resolve();
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
    const existing = [...this.periodLocks.values()].find(
      (l) =>
        l.workspaceId === input.workspaceId &&
        l.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) {
      return Promise.resolve(stripLock(existing));
    }
    const id = crypto.randomUUID();
    const row: StoredPeriodLock = {
      id,
      workspaceId: input.workspaceId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      reason: input.reason?.trim(),
      lockedByUserId: actorUserId,
      lockedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.periodLocks.set(id, row);
    return Promise.resolve(stripLock(row));
  }

  listPeriodLocks(workspaceId: string): Promise<PeriodLockSummary[]> {
    return Promise.resolve(
      [...this.periodLocks.values()]
        .filter((l) => l.workspaceId === workspaceId)
        .map(stripLock),
    );
  }

  async recordContribution(
    input: RecordContributionRequest,
  ): Promise<ContributionSummary> {
    if (!(await this.getAgreement(input.workspaceId, input.agreementId))) {
      throw new Error("AGREEMENT_NOT_FOUND");
    }
    await this.assertPeriodOpen(input.workspaceId);
    const id = crypto.randomUUID();
    const row: StoredContribution = {
      id,
      workspaceId: input.workspaceId,
      agreementId: input.agreementId,
      memberUserId: input.memberUserId,
      kind: input.kind,
      amount: input.amount,
      description: input.description?.trim(),
      recordedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.contributions.set(id, row);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      agreementId: row.agreementId,
      memberUserId: row.memberUserId,
      kind: row.kind,
      amount: row.amount,
      description: row.description,
      recordedAt: row.recordedAt,
    };
  }

  listContributions(
    workspaceId: string,
    agreementId?: string,
  ): Promise<ContributionSummary[]> {
    return Promise.resolve(
      [...this.contributions.values()]
        .filter(
          (c) =>
            c.workspaceId === workspaceId &&
            (!agreementId || c.agreementId === agreementId),
        )
        .map((c) => ({
          id: c.id,
          workspaceId: c.workspaceId,
          agreementId: c.agreementId,
          memberUserId: c.memberUserId,
          kind: c.kind,
          amount: c.amount,
          description: c.description,
          recordedAt: c.recordedAt,
        })),
    );
  }

  async recordLoan(input: RecordPartnerLoanRequest): Promise<PartnerLoanSummary> {
    if (!(await this.getAgreement(input.workspaceId, input.agreementId))) {
      throw new Error("AGREEMENT_NOT_FOUND");
    }
    await this.assertPeriodOpen(input.workspaceId);
    const id = crypto.randomUUID();
    const row: StoredLoan = {
      id,
      workspaceId: input.workspaceId,
      agreementId: input.agreementId,
      lenderUserId: input.lenderUserId,
      borrowerUserId: input.borrowerUserId,
      principal: input.principal,
      repaidMinor: "0",
      status: "open",
      recordedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.loans.set(id, row);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      agreementId: row.agreementId,
      lenderUserId: row.lenderUserId,
      borrowerUserId: row.borrowerUserId,
      principal: row.principal,
      repaidMinor: row.repaidMinor,
      status: row.status,
      recordedAt: row.recordedAt,
    };
  }

  async recordWithdrawal(input: RecordWithdrawalRequest): Promise<WithdrawalSummary> {
    if (!(await this.getAgreement(input.workspaceId, input.agreementId))) {
      throw new Error("AGREEMENT_NOT_FOUND");
    }
    await this.assertPeriodOpen(input.workspaceId);
    const id = crypto.randomUUID();
    const row: StoredWithdrawal = {
      id,
      workspaceId: input.workspaceId,
      agreementId: input.agreementId,
      memberUserId: input.memberUserId,
      amount: input.amount,
      reason: input.reason?.trim(),
      recordedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.withdrawals.set(id, row);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      agreementId: row.agreementId,
      memberUserId: row.memberUserId,
      amount: row.amount,
      reason: row.reason,
      recordedAt: row.recordedAt,
    };
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
      const minor = BigInt(c.amount.amountMinor);
      net += minor;
      lines.push({
        category: "contribution",
        label: c.description ?? `آورده ${c.kind}`,
        amountMinor: c.amount.amountMinor,
        currency: "IRR",
      });
    }
    for (const w of this.withdrawals.values()) {
      if (w.workspaceId !== workspaceId || w.memberUserId !== memberUserId) continue;
      const minor = BigInt(w.amount.amountMinor);
      net -= minor;
      lines.push({
        category: "withdrawal",
        label: w.reason ?? "برداشت",
        amountMinor: w.amount.amountMinor,
        currency: "IRR",
      });
    }
    for (const l of this.loans.values()) {
      if (l.workspaceId !== workspaceId) continue;
      if (l.lenderUserId === memberUserId) {
        const open = BigInt(l.principal.amountMinor) - BigInt(l.repaidMinor);
        net += open;
        lines.push({
          category: "loan",
          label: "قرض پرداخت‌شده",
          amountMinor: open.toString(),
          currency: "IRR",
        });
      }
      if (l.borrowerUserId === memberUserId) {
        const open = BigInt(l.principal.amountMinor) - BigInt(l.repaidMinor);
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
