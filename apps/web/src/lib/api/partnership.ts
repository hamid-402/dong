import type {
  AgreedPriceSummary,
  AgreementSummary,
  ContributionSummary,
  CreateAgreedPriceRequest,
  CreateAgreementRequest,
  OwnershipShareSummary,
  PartnerLoanSummary,
  RecordContributionRequest,
  RecordPartnerLoanRequest,
  RecordWithdrawalRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Agreement, contribution, partner-loan, withdrawal and ownership endpoints — domain slice (dong-50 #30). */
export const partnershipApi = {
  createAgreement: (workspaceId: string, body: CreateAgreementRequest) =>
    postWithOfflineQueue<AgreementSummary>({
      path: `/workspaces/${workspaceId}/agreements`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد توافق‌نامه",
    }),
  listAgreements: (workspaceId: string) =>
    apiFetch<AgreementSummary[]>(`/workspaces/${workspaceId}/agreements`),
  listAgreedPrices: (workspaceId: string, agreementId: string) =>
    apiFetch<AgreedPriceSummary[]>(
      `/workspaces/${workspaceId}/agreements/${agreementId}/agreed-prices`,
    ),
  createAgreedPrice: (
    workspaceId: string,
    agreementId: string,
    body: CreateAgreedPriceRequest,
  ) =>
    postWithOfflineQueue<AgreedPriceSummary>({
      path: `/workspaces/${workspaceId}/agreements/${agreementId}/agreed-prices`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت قیمت توافقی",
    }),
  recordContribution: (workspaceId: string, body: RecordContributionRequest) =>
    postWithOfflineQueue<ContributionSummary>({
      path: `/workspaces/${workspaceId}/contributions`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت آورده",
    }),
  recordPartnerLoan: (workspaceId: string, body: RecordPartnerLoanRequest) =>
    postWithOfflineQueue<PartnerLoanSummary>({
      path: `/workspaces/${workspaceId}/partner-loans`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت وام شریک",
    }),
  recordWithdrawal: (workspaceId: string, body: RecordWithdrawalRequest) =>
    postWithOfflineQueue<unknown>({
      path: `/workspaces/${workspaceId}/withdrawals`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت برداشت",
    }),
  ownershipShares: (workspaceId: string, agreementId: string) =>
    apiFetch<OwnershipShareSummary[]>(
      `/workspaces/${workspaceId}/agreements/${agreementId}/ownership-shares`,
    ),
};
