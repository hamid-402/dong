import type {
  CastProposalVoteRequest,
  CreateProposalRequest,
  ProposalSettingsSummary,
  ProposalSummary,
  ProposalVoteChoice,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";

export type ProposalStore = {
  readonly persistence: "memory" | "postgres";
  getSettings(workspaceId: string, actorUserId: string): Promise<ProposalSettingsSummary>;
  updateSettings(
    workspaceId: string,
    actorUserId: string,
    input: UpdateProposalSettingsRequest,
  ): Promise<ProposalSettingsSummary>;
  createProposal(
    actorUserId: string,
    input: CreateProposalRequest,
  ): Promise<ProposalSummary>;
  listProposals(
    workspaceId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary[]>;
  getProposal(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary | undefined>;
  castVote(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    choice: ProposalVoteChoice,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary>;
  markAccepted(
    workspaceId: string,
    proposalId: string,
    needId: string,
    actorUserId: string,
  ): Promise<ProposalSummary | undefined>;
  markRejected(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
  ): Promise<ProposalSummary | undefined>;
  withdraw(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary>;
};

export const PROPOSAL_STORE = Symbol("PROPOSAL_STORE");

export function requiredYesVotes(activeMemberCount: number, quorumPercent: number): number {
  const n = Math.max(0, activeMemberCount);
  if (n === 0) return 1;
  return Math.max(1, Math.ceil((n * quorumPercent) / 100));
}

export type { CastProposalVoteRequest, CreateProposalRequest, UpdateProposalSettingsRequest };
