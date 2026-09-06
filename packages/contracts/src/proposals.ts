import type { Money } from "./money.js";

export type ProposalKind = "goods" | "service";
export type ProposalStatus = "open" | "accepted" | "rejected" | "withdrawn";
export type ProposalVoteChoice = "yes" | "no";

export type ProposalSettingsSummary = {
  workspaceId: string;
  /** 1–100; share of active members whose yes votes accept the proposal. */
  quorumPercent: number;
  updatedAt: string;
};

export type UpdateProposalSettingsRequest = {
  quorumPercent: number;
};

export type CreateProposalRequest = {
  workspaceId: string;
  kind: ProposalKind;
  title: string;
  description?: string;
  estimatedAmount?: Money;
  idempotencyKey: string;
};

export type CastProposalVoteRequest = {
  choice: ProposalVoteChoice;
};

export type ProposalTally = {
  yesCount: number;
  noCount: number;
  activeMemberCount: number;
  requiredYes: number;
  myVote?: ProposalVoteChoice;
};

export type ProposalSummary = {
  id: string;
  workspaceId: string;
  kind: ProposalKind;
  title: string;
  description?: string;
  estimatedAmount?: Money;
  status: ProposalStatus;
  createdByUserId: string;
  acceptedNeedId?: string;
  createdAt: string;
  updatedAt: string;
  tally: ProposalTally;
};
