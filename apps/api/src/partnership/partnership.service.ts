import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  assertReportCategoriesSeparated,
  buildMemberReportExport,
  type AgreementSummary,
  type AuthActor,
  type ContributionSummary,
  type CreateAgreementRequest,
  type CreatePeriodLockRequest,
  type MemberAccountReport,
  type OwnershipShareSummary,
  type PartnerLoanSummary,
  type PeriodLockSummary,
  type RecordContributionRequest,
  type RecordPartnerLoanRequest,
  type RecordWithdrawalRequest,
  type ReportExportPayload,
  type WithdrawalSummary,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { PARTNERSHIP_STORE, type PartnershipStore } from "./partnership.types.js";

@Injectable()
export class PartnershipService {
  constructor(
    @Inject(PARTNERSHIP_STORE) private readonly store: PartnershipStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  async createAgreement(
    actor: AuthActor,
    workspaceId: string,
    body: CreateAgreementRequest,
  ): Promise<AgreementSummary> {
    await this.requireFinance(workspaceId, actor.userId);
    return this.store.createAgreement(actor.userId, { ...body, workspaceId });
  }

  async listAgreements(actor: AuthActor, workspaceId: string): Promise<AgreementSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listAgreements(workspaceId);
  }

  async recordContribution(
    actor: AuthActor,
    workspaceId: string,
    body: RecordContributionRequest,
  ): Promise<ContributionSummary> {
    await this.requireFinance(workspaceId, actor.userId);
    if (body.kind === "cash" && (!body.amount || BigInt(body.amount.amountMinor) <= 0n)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Cash contribution requires positive amount",
        status: 400,
      });
    }
    try {
      return await this.store.recordContribution({ ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async recordLoan(
    actor: AuthActor,
    workspaceId: string,
    body: RecordPartnerLoanRequest,
  ): Promise<PartnerLoanSummary> {
    await this.requireFinance(workspaceId, actor.userId);
    if (BigInt(body.principal.amountMinor) <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Loan principal must be positive",
        status: 400,
      });
    }
    try {
      return await this.store.recordLoan({ ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async recordWithdrawal(
    actor: AuthActor,
    workspaceId: string,
    body: RecordWithdrawalRequest,
  ): Promise<WithdrawalSummary> {
    await this.requireFinance(workspaceId, actor.userId);
    if (BigInt(body.amount.amountMinor) <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Withdrawal amount must be positive",
        status: 400,
      });
    }
    try {
      return await this.store.recordWithdrawal({ ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async ownershipShares(
    actor: AuthActor,
    workspaceId: string,
    agreementId: string,
  ): Promise<OwnershipShareSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    if (!(await this.store.getAgreement(workspaceId, agreementId))) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Agreement not found",
        status: 404,
      });
    }
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    const names = new Map(members?.map((m) => [m.userId, m.displayName]) ?? []);
    return this.store.computeOwnershipShares(workspaceId, agreementId, names);
  }

  async memberReport(
    actor: AuthActor,
    workspaceId: string,
    memberUserId: string,
  ): Promise<MemberAccountReport> {
    await this.requireMember(workspaceId, actor.userId);
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    const member = members?.find((m) => m.userId === memberUserId);
    if (!member) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Member not found",
        status: 404,
      });
    }
    const report = await this.store.buildMemberReport(
      workspaceId,
      memberUserId,
      member.displayName,
    );
    assertReportCategoriesSeparated(report);
    return report;
  }

  async exportMemberReport(
    actor: AuthActor,
    workspaceId: string,
    memberUserId: string,
  ): Promise<ReportExportPayload> {
    const report = await this.memberReport(actor, workspaceId, memberUserId);
    return buildMemberReportExport(report);
  }

  async createPeriodLock(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePeriodLockRequest,
  ): Promise<PeriodLockSummary> {
    await this.requireFinance(workspaceId, actor.userId);
    try {
      return await this.store.createPeriodLock(actor.userId, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async listPeriodLocks(actor: AuthActor, workspaceId: string): Promise<PeriodLockSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listPeriodLocks(workspaceId);
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error && error.message === "AGREEMENT_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Agreement not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "PERIOD_LOCKED") {
      throw new BadRequestException({
        type: "https://dang.local/problems/period-locked",
        title: "Accounting period is locked",
        status: 400,
      });
    }
    if (
      error instanceof Error &&
      (error.message === "PERIOD_DATE" || error.message === "PERIOD_RANGE")
    ) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid period lock range",
        status: 400,
      });
    }
    throw error;
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }

  private async requireFinance(workspaceId: string, userId: string): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, userId);
    const self = members?.find((m) => m.userId === userId);
    if (!self || !["owner", "admin", "finance"].includes(self.role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Finance role required",
        status: 403,
      });
    }
  }
}
