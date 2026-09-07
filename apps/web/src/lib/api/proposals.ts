import type {
  CastProposalVoteRequest,
  CreateProposalRequest,
  ProposalSettingsSummary,
  ProposalSummary,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";

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
    apiFetch<ProposalSummary>(
      `/workspaces/${workspaceId}/proposals`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  castProposalVote: (
    workspaceId: string,
    proposalId: string,
    body: CastProposalVoteRequest,
  ) =>
    apiFetch<ProposalSummary>(`/workspaces/${workspaceId}/proposals/${proposalId}/votes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  withdrawProposal: (workspaceId: string, proposalId: string) =>
    apiFetch<ProposalSummary>(`/workspaces/${workspaceId}/proposals/${proposalId}/withdraw`, {
      method: "POST",
      body: "{}",
    }),
};
