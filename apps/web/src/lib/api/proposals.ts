import type {
  CastProposalVoteRequest,
  CreateProposalRequest,
  ProposalSettingsSummary,
  ProposalSummary,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Proposal settings, proposal and vote endpoints — domain slice (dong-50 #30). */
export const proposalsApi = {
  getProposalSettings: (workspaceId: string) =>
    apiFetch<ProposalSettingsSummary>(`/workspaces/${workspaceId}/proposal-settings`),
  updateProposalSettings: (workspaceId: string, body: UpdateProposalSettingsRequest) =>
    apiFetch<ProposalSettingsSummary>(`/workspaces/${workspaceId}/proposal-settings`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listProposals: (workspaceId: string) =>
    apiFetch<ProposalSummary[]>(`/workspaces/${workspaceId}/proposals`),
  createProposal: (workspaceId: string, body: CreateProposalRequest) =>
    postWithOfflineQueue<ProposalSummary>({
      path: `/workspaces/${workspaceId}/proposals`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.title?.trim() || "ایجاد پیشنهاد",
    }),
  castProposalVote: (
    workspaceId: string,
    proposalId: string,
    body: CastProposalVoteRequest,
  ) =>
    postWithOfflineQueue<ProposalSummary>({
      path: `/workspaces/${workspaceId}/proposals/${proposalId}/votes`,
      body: JSON.stringify(body),
      label: "رأی به پیشنهاد",
    }),
  withdrawProposal: (workspaceId: string, proposalId: string) =>
    postWithOfflineQueue<ProposalSummary>({
      path: `/workspaces/${workspaceId}/proposals/${proposalId}/withdraw`,
      label: "پس‌گرفتن پیشنهاد",
    }),
};
