import type {
  CreateProposalRequest,
  ProposalSettingsSummary,
  ProposalSummary,
  ProposalVoteChoice,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";
import { requiredYesVotes, type ProposalStore } from "./proposal.types.js";

type StoredVote = { userId: string; choice: ProposalVoteChoice; createdAt: string };

type StoredProposal = {
  id: string;
  workspaceId: string;
  kind: CreateProposalRequest["kind"];
  title: string;
  description?: string;
  estimatedAmountMinor?: string;
  status: ProposalSummary["status"];
  createdByUserId: string;
  acceptedNeedId?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  votes: Map<string, StoredVote>;
};

function toSummary(
  row: StoredProposal,
  actorUserId: string,
  activeMemberCount: number,
  quorumPercent: number,
): ProposalSummary {
  let yesCount = 0;
  let noCount = 0;
  for (const vote of row.votes.values()) {
    if (vote.choice === "yes") yesCount += 1;
    else noCount += 1;
  }
  const my = row.votes.get(actorUserId);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    estimatedAmount: row.estimatedAmountMinor
      ? { amountMinor: row.estimatedAmountMinor, currency: "IRR" }
      : undefined,
    status: row.status,
    createdByUserId: row.createdByUserId,
    acceptedNeedId: row.acceptedNeedId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tally: {
      yesCount,
      noCount,
      activeMemberCount,
      requiredYes: requiredYesVotes(activeMemberCount, quorumPercent),
      myVote: my?.choice,
    },
  };
}

export class MemoryProposalStore implements ProposalStore {
  readonly persistence = "memory" as const;
  private readonly settings = new Map<string, ProposalSettingsSummary>();
  private readonly proposals = new Map<string, StoredProposal>();

  async getSettings(workspaceId: string, _actorUserId: string): Promise<ProposalSettingsSummary> {
    const existing = this.settings.get(workspaceId);
    if (existing) return existing;
    const created: ProposalSettingsSummary = {
      workspaceId,
      quorumPercent: 51,
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(workspaceId, created);
    return created;
  }

  async updateSettings(
    workspaceId: string,
    _actorUserId: string,
    input: UpdateProposalSettingsRequest,
  ): Promise<ProposalSettingsSummary> {
    const next: ProposalSettingsSummary = {
      workspaceId,
      quorumPercent: input.quorumPercent,
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(workspaceId, next);
    return next;
  }

  async createProposal(
    actorUserId: string,
    input: CreateProposalRequest,
  ): Promise<ProposalSummary> {
    const key = `${input.workspaceId}:${input.idempotencyKey.trim()}`;
    for (const row of this.proposals.values()) {
      if (row.workspaceId === input.workspaceId && row.idempotencyKey === input.idempotencyKey.trim()) {
        const settings = await this.getSettings(input.workspaceId, actorUserId);
        return toSummary(row, actorUserId, 1, settings.quorumPercent);
      }
    }
    const now = new Date().toISOString();
    const row: StoredProposal = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      kind: input.kind,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      estimatedAmountMinor: input.estimatedAmount?.amountMinor,
      status: "open",
      createdByUserId: actorUserId,
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: now,
      updatedAt: now,
      votes: new Map(),
    };
    this.proposals.set(row.id, row);
    void key;
    const settings = await this.getSettings(input.workspaceId, actorUserId);
    return toSummary(row, actorUserId, 1, settings.quorumPercent);
  }

  async listProposals(
    workspaceId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary[]> {
    return [...this.proposals.values()]
      .filter((row) => row.workspaceId === workspaceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((row) => toSummary(row, actorUserId, activeMemberCount, quorumPercent));
  }

  async getProposal(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary | undefined> {
    const row = this.proposals.get(proposalId);
    if (!row || row.workspaceId !== workspaceId) return undefined;
    return toSummary(row, actorUserId, activeMemberCount, quorumPercent);
  }

  async castVote(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    choice: ProposalVoteChoice,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary> {
    const row = this.proposals.get(proposalId);
    if (!row || row.workspaceId !== workspaceId) throw new Error("PROPOSAL_NOT_FOUND");
    if (row.status !== "open") throw new Error("PROPOSAL_NOT_OPEN");
    row.votes.set(actorUserId, {
      userId: actorUserId,
      choice,
      createdAt: new Date().toISOString(),
    });
    row.updatedAt = new Date().toISOString();
    return toSummary(row, actorUserId, activeMemberCount, quorumPercent);
  }

  async markAccepted(
    workspaceId: string,
    proposalId: string,
    needId: string,
    _actorUserId: string,
  ): Promise<ProposalSummary | undefined> {
    const row = this.proposals.get(proposalId);
    if (!row || row.workspaceId !== workspaceId) return undefined;
    row.status = "accepted";
    row.acceptedNeedId = needId;
    row.updatedAt = new Date().toISOString();
    return toSummary(row, row.createdByUserId, 1, 51);
  }

  async markRejected(
    workspaceId: string,
    proposalId: string,
    _actorUserId: string,
  ): Promise<ProposalSummary | undefined> {
    const row = this.proposals.get(proposalId);
    if (!row || row.workspaceId !== workspaceId) return undefined;
    row.status = "rejected";
    row.updatedAt = new Date().toISOString();
    return toSummary(row, row.createdByUserId, 1, 51);
  }

  async withdraw(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary> {
    const row = this.proposals.get(proposalId);
    if (!row || row.workspaceId !== workspaceId) throw new Error("PROPOSAL_NOT_FOUND");
    if (row.status !== "open") throw new Error("PROPOSAL_NOT_OPEN");
    row.status = "withdrawn";
    row.updatedAt = new Date().toISOString();
    return toSummary(row, actorUserId, activeMemberCount, quorumPercent);
  }
}
