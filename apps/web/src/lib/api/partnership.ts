import type {
  AgreementSummary,
  ContributionSummary,
  CreateAgreementRequest,
  OwnershipShareSummary,
  PartnerLoanSummary,
  RecordContributionRequest,
  RecordPartnerLoanRequest,
  RecordWithdrawalRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Agreement, contribution, partner-loan, withdrawal and ownership endpoints — domain slice (dong-50 #30). */
export const partnershipApi = {
  createAgreement: (workspaceId: string, body: CreateAgreementRequest) =>
    apiFetch<AgreementSummary>(
      `/workspaces/${workspaceId}/agreements`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listAgreements: (workspaceId: string) =>
    apiFetch<AgreementSummary[]>(`/workspaces/${workspaceId}/agreements`),
  recordContribution: (workspaceId: string, body: RecordContributionRequest) =>
    apiFetch<ContributionSummary>(
      `/workspaces/${workspaceId}/contributions`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  recordPartnerLoan: (workspaceId: string, body: RecordPartnerLoanRequest) =>
    apiFetch<PartnerLoanSummary>(
      `/workspaces/${workspaceId}/partner-loans`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  recordWithdrawal: (workspaceId: string, body: RecordWithdrawalRequest) =>
    apiFetch<unknown>(
      `/workspaces/${workspaceId}/withdrawals`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  ownershipShares: (workspaceId: string, agreementId: string) =>
    apiFetch<OwnershipShareSummary[]>(
      `/workspaces/${workspaceId}/agreements/${agreementId}/ownership-shares`,
    ),
};
