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

export type PartnershipStore = {
  readonly persistence: "memory" | "postgres";
  createAgreement(
    actorUserId: string,
    input: CreateAgreementRequest,
  ): Promise<AgreementSummary>;
  listAgreements(workspaceId: string): Promise<AgreementSummary[]>;
  getAgreement(
    workspaceId: string,
    agreementId: string,
  ): Promise<AgreementSummary | undefined>;
  createPeriodLock(
    actorUserId: string,
    input: CreatePeriodLockRequest,
  ): Promise<PeriodLockSummary>;
  listPeriodLocks(workspaceId: string): Promise<PeriodLockSummary[]>;
  assertPeriodOpen(workspaceId: string, isoDate?: string): Promise<void>;
  recordContribution(input: RecordContributionRequest): Promise<ContributionSummary>;
  listContributions(
    workspaceId: string,
    agreementId?: string,
  ): Promise<ContributionSummary[]>;
  recordLoan(input: RecordPartnerLoanRequest): Promise<PartnerLoanSummary>;
  recordWithdrawal(input: RecordWithdrawalRequest): Promise<WithdrawalSummary>;
  computeOwnershipShares(
    workspaceId: string,
    agreementId: string,
    memberNames: Map<string, string>,
  ): Promise<OwnershipShareSummary[]>;
  buildMemberReport(
    workspaceId: string,
    memberUserId: string,
    displayName: string,
  ): Promise<MemberAccountReport>;
};

export const PARTNERSHIP_STORE = Symbol("PARTNERSHIP_STORE");
