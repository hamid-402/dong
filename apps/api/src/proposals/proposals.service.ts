import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CastProposalVoteRequest,
  CreateProposalRequest,
  MembershipRole,
  ProposalSettingsSummary,
  ProposalSummary,
  UpdateProposalSettingsRequest,
} from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { PROPOSAL_STORE, type ProposalStore } from "./proposal.types.js";

const SETTINGS_ROLES = new Set<MembershipRole>(["owner", "admin"]);

@Injectable()
export class ProposalsService {
  constructor(
    @Inject(PROPOSAL_STORE) private readonly store: ProposalStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async getSettings(actor: AuthActor, workspaceId: string): Promise<ProposalSettingsSummary> {
    await this.requireProposalWorkspace(workspaceId, actor.userId);
    return this.store.getSettings(workspaceId, actor.userId);
  }

  async updateSettings(
    actor: AuthActor,
    workspaceId: string,
    body: UpdateProposalSettingsRequest,
  ): Promise<ProposalSettingsSummary> {
    const membership = await this.requireProposalWorkspace(workspaceId, actor.userId);
    if (!SETTINGS_ROLES.has(membership.role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Only owner/admin can change quorum",
        status: 403,
      });
    }
    const pct = Number(body.quorumPercent);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "quorumPercent must be 1–100",
        status: 400,
      });
    }
    return this.store.updateSettings(workspaceId, actor.userId, { quorumPercent: pct });
  }

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateProposalRequest,
  ): Promise<ProposalSummary> {
    await this.requireProposalWorkspace(workspaceId, actor.userId);
    const title = body.title?.trim() ?? "";
    if (title.length < 2 || title.length > 120) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid proposal title",
        status: 400,
        detail: "Title must be 2–120 characters.",
      });
    }
    if (body.kind !== "goods" && body.kind !== "service") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid proposal kind",
        status: 400,
      });
    }
    if (!body.idempotencyKey?.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "idempotencyKey required",
        status: 400,
      });
    }

    const { members, settings } = await this.context(workspaceId, actor.userId);
    const created = await this.store.createProposal(actor.userId, {
      ...body,
      workspaceId,
      title,
    });
    const withTally =
      (await this.store.getProposal(
        workspaceId,
        created.id,
        actor.userId,
        members.length,
        settings.quorumPercent,
      )) ?? created;

    await Promise.all(
      members
        .filter((m) => m.userId !== actor.userId)
        .map((m) =>
          this.notifications.notify(actor.userId, {
            workspaceId,
            userId: m.userId,
            channel: "in_app",
            title: "پیشنهاد جدید برای رأی",
            body: title,
            metadata: { event: "proposal.created", route: "/proposals", proposalId: created.id },
          }),
        ),
    );

    return withTally;
  }

  async list(actor: AuthActor, workspaceId: string): Promise<ProposalSummary[]> {
    await this.requireProposalWorkspace(workspaceId, actor.userId);
    const { members, settings } = await this.context(workspaceId, actor.userId);
    return this.store.listProposals(
      workspaceId,
      actor.userId,
      members.length,
      settings.quorumPercent,
    );
  }

  async vote(
    actor: AuthActor,
    workspaceId: string,
    proposalId: string,
    body: CastProposalVoteRequest,
  ): Promise<ProposalSummary> {
    await this.requireProposalWorkspace(workspaceId, actor.userId);
    if (body.choice !== "yes" && body.choice !== "no") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "choice must be yes or no",
        status: 400,
      });
    }

    const { members, settings } = await this.context(workspaceId, actor.userId);
    let summary: ProposalSummary;
    try {
      summary = await this.store.castVote(
        workspaceId,
        proposalId,
        actor.userId,
        body.choice,
        members.length,
        settings.quorumPercent,
      );
    } catch (error: unknown) {
      this.rethrowVoteError(error);
    }

    if (summary.tally.yesCount >= summary.tally.requiredYes && summary.status === "open") {
      return this.acceptAndCreateNeed(actor, workspaceId, summary);
    }

    const voted = summary.tally.yesCount + summary.tally.noCount;
    if (
      summary.status === "open" &&
      voted >= summary.tally.activeMemberCount &&
      summary.tally.yesCount < summary.tally.requiredYes
    ) {
      const rejected = await this.store.markRejected(workspaceId, proposalId, actor.userId);
      if (rejected) {
        return (
          (await this.store.getProposal(
            workspaceId,
            proposalId,
            actor.userId,
            members.length,
            settings.quorumPercent,
          )) ?? rejected
        );
      }
    }

    return summary;
  }

  async withdraw(
    actor: AuthActor,
    workspaceId: string,
    proposalId: string,
  ): Promise<ProposalSummary> {
    const membership = await this.requireProposalWorkspace(workspaceId, actor.userId);
    const { members, settings } = await this.context(workspaceId, actor.userId);
    const existing = await this.store.getProposal(
      workspaceId,
      proposalId,
      actor.userId,
      members.length,
      settings.quorumPercent,
    );
    if (!existing) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Proposal not found",
        status: 404,
      });
    }
    const canWithdraw =
      existing.createdByUserId === actor.userId || SETTINGS_ROLES.has(membership.role);
    if (!canWithdraw) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Only proposer or owner/admin can withdraw",
        status: 403,
      });
    }
    try {
      return await this.store.withdraw(
        workspaceId,
        proposalId,
        actor.userId,
        members.length,
        settings.quorumPercent,
      );
    } catch (error: unknown) {
      this.rethrowVoteError(error);
    }
  }

  private async acceptAndCreateNeed(
    actor: AuthActor,
    workspaceId: string,
    summary: ProposalSummary,
  ): Promise<ProposalSummary> {
    const need = await this.procurement.createNeed(actor.userId, {
      workspaceId,
      title: summary.title,
      description: summary.description,
      estimatedAmount: summary.estimatedAmount,
      idempotencyKey: `proposal-need:${summary.id}`,
    });
    await this.store.markAccepted(workspaceId, summary.id, need.id, actor.userId);
    const { members, settings } = await this.context(workspaceId, actor.userId);
    const accepted =
      (await this.store.getProposal(
        workspaceId,
        summary.id,
        actor.userId,
        members.length,
        settings.quorumPercent,
      )) ?? summary;

    await this.notifications.notify(actor.userId, {
      workspaceId,
      userId: summary.createdByUserId,
      channel: "in_app",
      title: "پیشنهاد پذیرفته شد",
      body: `«${summary.title}» به لیست نیازها اضافه شد`,
      metadata: {
        event: "proposal.accepted",
        route: "/proposals",
        proposalId: summary.id,
        needId: need.id,
      },
    });

    return accepted;
  }

  private async context(workspaceId: string, actorUserId: string) {
    const members = (await this.iam.listMembers(workspaceId, actorUserId)) ?? [];
    const settings = await this.store.getSettings(workspaceId, actorUserId);
    return { members, settings };
  }

  private async requireProposalWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!workspace) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    const kind = spaceKindForTemplate(workspace.template);
    if (kind === "personal") {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Proposals are for group/org workspaces",
        status: 403,
        detail: "فضای شخصی پیشنهاد جمعی ندارد.",
      });
    }
    const members = await this.iam.listMembers(workspaceId, userId);
    const membership = members?.find((m) => m.userId === userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    return membership;
  }

  private rethrowVoteError(error: unknown): never {
    if (error instanceof Error && error.message === "PROPOSAL_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Proposal not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "PROPOSAL_NOT_OPEN") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Proposal is not open for voting",
        status: 400,
      });
    }
    throw error;
  }
}
