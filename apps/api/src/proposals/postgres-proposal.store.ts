import {
  and,
  createDatabase,
  eq,
  proposal,
  proposalVote,
  withTenantContext,
  workspaceProposalSettings,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateProposalRequest,
  ProposalSettingsSummary,
  ProposalSummary,
  ProposalVoteChoice,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";
import { requiredYesVotes, type ProposalStore } from "./proposal.types.js";

type ProposalRow = typeof proposal.$inferSelect;
type VoteRow = typeof proposalVote.$inferSelect;

function mapSettings(row: typeof workspaceProposalSettings.$inferSelect): ProposalSettingsSummary {
  return {
    workspaceId: row.workspaceId,
    quorumPercent: row.quorumPercent,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapProposal(
  row: ProposalRow,
  votes: VoteRow[],
  actorUserId: string,
  activeMemberCount: number,
  quorumPercent: number,
): ProposalSummary {
  let yesCount = 0;
  let noCount = 0;
  let myVote: ProposalVoteChoice | undefined;
  for (const vote of votes) {
    if (vote.choice === "yes") yesCount += 1;
    else noCount += 1;
    if (vote.userId === actorUserId) myVote = vote.choice;
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    title: row.title,
    description: row.description ?? undefined,
    estimatedAmount:
      row.estimatedAmountMinor != null
        ? { amountMinor: row.estimatedAmountMinor.toString(), currency: "IRR" }
        : undefined,
    status: row.status,
    createdByUserId: row.createdByUserId,
    acceptedNeedId: row.acceptedNeedId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tally: {
      yesCount,
      noCount,
      activeMemberCount,
      requiredYes: requiredYesVotes(activeMemberCount, quorumPercent),
      myVote,
    },
  };
}

export class PostgresProposalStore implements ProposalStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresProposalStore {
    const { db } = createDatabase(connectionString);
    return new PostgresProposalStore(db);
  }

  getSettings(workspaceId: string, actorUserId: string): Promise<ProposalSettingsSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(workspaceProposalSettings)
        .where(eq(workspaceProposalSettings.workspaceId, workspaceId))
        .limit(1);
      if (existing[0]) return mapSettings(existing[0]);
      const inserted = await tx
        .insert(workspaceProposalSettings)
        .values({ workspaceId, quorumPercent: 51 })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("PROPOSAL_SETTINGS_INSERT_FAILED");
      return mapSettings(row);
    });
  }

  updateSettings(
    workspaceId: string,
    actorUserId: string,
    input: UpdateProposalSettingsRequest,
  ): Promise<ProposalSettingsSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(workspaceProposalSettings)
        .where(eq(workspaceProposalSettings.workspaceId, workspaceId))
        .limit(1);
      if (existing[0]) {
        const updated = await tx
          .update(workspaceProposalSettings)
          .set({
            quorumPercent: input.quorumPercent,
            updatedByUserId: actorUserId,
            updatedAt: new Date(),
          })
          .where(eq(workspaceProposalSettings.workspaceId, workspaceId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("PROPOSAL_SETTINGS_UPDATE_FAILED");
        return mapSettings(row);
      }
      const inserted = await tx
        .insert(workspaceProposalSettings)
        .values({
          workspaceId,
          quorumPercent: input.quorumPercent,
          updatedByUserId: actorUserId,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("PROPOSAL_SETTINGS_INSERT_FAILED");
      return mapSettings(row);
    });
  }

  createProposal(
    actorUserId: string,
    input: CreateProposalRequest,
  ): Promise<ProposalSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(proposal)
          .where(
            and(
              eq(proposal.workspaceId, input.workspaceId),
              eq(proposal.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) {
          const votes = await tx
            .select()
            .from(proposalVote)
            .where(eq(proposalVote.proposalId, existing[0].id));
          return mapProposal(existing[0], votes, actorUserId, 1, 51);
        }
        const inserted = await tx
          .insert(proposal)
          .values({
            workspaceId: input.workspaceId,
            kind: input.kind,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            estimatedAmountMinor: input.estimatedAmount
              ? BigInt(input.estimatedAmount.amountMinor)
              : null,
            currency: "IRR",
            status: "open",
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("PROPOSAL_INSERT_FAILED");
        return mapProposal(row, [], actorUserId, 1, 51);
      },
    );
  }

  listProposals(
    workspaceId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx.select().from(proposal).where(eq(proposal.workspaceId, workspaceId));
      const result: ProposalSummary[] = [];
      for (const row of rows) {
        const votes = await tx
          .select()
          .from(proposalVote)
          .where(eq(proposalVote.proposalId, row.id));
        result.push(mapProposal(row, votes, actorUserId, activeMemberCount, quorumPercent));
      }
      result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return result;
    });
  }

  getProposal(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary | undefined> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(proposal)
        .where(and(eq(proposal.workspaceId, workspaceId), eq(proposal.id, proposalId)))
        .limit(1);
      const row = rows[0];
      if (!row) return undefined;
      const votes = await tx
        .select()
        .from(proposalVote)
        .where(eq(proposalVote.proposalId, row.id));
      return mapProposal(row, votes, actorUserId, activeMemberCount, quorumPercent);
    });
  }

  castVote(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    choice: ProposalVoteChoice,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(proposal)
        .where(and(eq(proposal.workspaceId, workspaceId), eq(proposal.id, proposalId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error("PROPOSAL_NOT_FOUND");
      if (row.status !== "open") throw new Error("PROPOSAL_NOT_OPEN");

      const existingVote = await tx
        .select()
        .from(proposalVote)
        .where(
          and(eq(proposalVote.proposalId, proposalId), eq(proposalVote.userId, actorUserId)),
        )
        .limit(1);
      if (existingVote[0]) {
        await tx
          .update(proposalVote)
          .set({ choice })
          .where(
            and(eq(proposalVote.proposalId, proposalId), eq(proposalVote.userId, actorUserId)),
          );
      } else {
        await tx.insert(proposalVote).values({
          proposalId,
          userId: actorUserId,
          choice,
        });
      }
      await tx
        .update(proposal)
        .set({ updatedAt: new Date() })
        .where(eq(proposal.id, proposalId));

      const refreshed = await tx
        .select()
        .from(proposal)
        .where(eq(proposal.id, proposalId))
        .limit(1);
      const votes = await tx
        .select()
        .from(proposalVote)
        .where(eq(proposalVote.proposalId, proposalId));
      return mapProposal(refreshed[0]!, votes, actorUserId, activeMemberCount, quorumPercent);
    });
  }

  markAccepted(
    workspaceId: string,
    proposalId: string,
    needId: string,
    actorUserId: string,
  ): Promise<ProposalSummary | undefined> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const updated = await tx
        .update(proposal)
        .set({
          status: "accepted",
          acceptedNeedId: needId,
          updatedAt: new Date(),
        })
        .where(and(eq(proposal.workspaceId, workspaceId), eq(proposal.id, proposalId)))
        .returning();
      const row = updated[0];
      if (!row) return undefined;
      const votes = await tx
        .select()
        .from(proposalVote)
        .where(eq(proposalVote.proposalId, proposalId));
      return mapProposal(row, votes, row.createdByUserId, 1, 51);
    });
  }

  markRejected(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
  ): Promise<ProposalSummary | undefined> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const updated = await tx
        .update(proposal)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(proposal.workspaceId, workspaceId), eq(proposal.id, proposalId)))
        .returning();
      const row = updated[0];
      if (!row) return undefined;
      const votes = await tx
        .select()
        .from(proposalVote)
        .where(eq(proposalVote.proposalId, proposalId));
      return mapProposal(row, votes, row.createdByUserId, 1, 51);
    });
  }

  withdraw(
    workspaceId: string,
    proposalId: string,
    actorUserId: string,
    activeMemberCount: number,
    quorumPercent: number,
  ): Promise<ProposalSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(proposal)
        .where(and(eq(proposal.workspaceId, workspaceId), eq(proposal.id, proposalId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error("PROPOSAL_NOT_FOUND");
      if (row.status !== "open") throw new Error("PROPOSAL_NOT_OPEN");
      const updated = await tx
        .update(proposal)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(eq(proposal.id, proposalId))
        .returning();
      const next = updated[0];
      if (!next) throw new Error("PROPOSAL_UPDATE_FAILED");
      const votes = await tx
        .select()
        .from(proposalVote)
        .where(eq(proposalVote.proposalId, proposalId));
      return mapProposal(next, votes, actorUserId, activeMemberCount, quorumPercent);
    });
  }
}
