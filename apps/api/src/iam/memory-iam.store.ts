import type {
  AuthActor,
  CreateInviteResponse,
  InviteSummary,
  MembershipRole,
  MembershipSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import type {
  CreateInviteInput,
  CreateWorkspaceInput,
  IamStore,
  UpsertDevActorInput,
} from "./iam.types.js";
import { INVITE_OWNER_ROLES } from "./iam.types.js";
import { hashInviteToken, issueInviteToken } from "./invite-token.js";

type StoredUser = {
  id: string;
  externalSubject: string;
  displayName: string;
};

type StoredWorkspace = WorkspaceSummary & {
  createdBy: string;
  createdAt: string;
};

type StoredMembership = {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
  defaultShares: number;
  joinedAt: string;
};

type StoredInvite = {
  id: string;
  workspaceId: string;
  tokenHash: string;
  role: MembershipRole;
  invitedSubject?: string;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
  createdAt: string;
};

function newId(): string {
  return crypto.randomUUID();
}

function toInviteSummary(invite: StoredInvite): InviteSummary {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    role: invite.role,
    invitedSubject: invite.invitedSubject,
    invitedByUserId: invite.invitedByUserId,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    createdAt: invite.createdAt,
  };
}

/**
 * In-memory IAM store used when DATABASE_URL is unset or Postgres is unavailable.
 */
export class MemoryIamStore implements IamStore {
  readonly persistence = "memory" as const;

  private readonly users = new Map<string, StoredUser>();
  private readonly usersBySubject = new Map<string, StoredUser>();
  private readonly workspaces = new Map<string, StoredWorkspace>();
  private readonly memberships = new Map<string, StoredMembership>();
  private readonly invites = new Map<string, StoredInvite>();
  /** Canonical personal workspace id per user. */
  private readonly personalByUser = new Map<string, string>();

  upsertDevActor(input: UpsertDevActorInput): Promise<AuthActor> {
    const existing = this.usersBySubject.get(input.externalSubject);
    if (existing) {
      existing.displayName = input.displayName;
      return Promise.resolve({
        userId: existing.id,
        externalSubject: existing.externalSubject,
        displayName: existing.displayName,
        authMode: "dev",
      });
    }

    const user: StoredUser = {
      id: input.userId ?? newId(),
      externalSubject: input.externalSubject,
      displayName: input.displayName,
    };
    this.users.set(user.id, user);
    this.usersBySubject.set(user.externalSubject, user);
    return Promise.resolve({
      userId: user.id,
      externalSubject: user.externalSubject,
      displayName: user.displayName,
      authMode: "dev",
    });
  }

  listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
    const result: WorkspaceSummary[] = [];
    for (const membership of this.memberships.values()) {
      if (membership.userId !== userId) continue;
      const workspace = this.workspaces.get(membership.workspaceId);
      if (!workspace) continue;
      result.push({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        template: workspace.template,
        timezone: workspace.timezone,
        displayUnit: workspace.displayUnit,
      });
    }
    return Promise.resolve(result);
  }

  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const normalizedSlug = input.slug.trim().toLowerCase();
    for (const workspace of this.workspaces.values()) {
      if (workspace.slug === normalizedSlug) {
        return Promise.reject(new Error("WORKSPACE_SLUG_TAKEN"));
      }
    }

    if (input.template === "personal" && this.personalByUser.has(input.actorUserId)) {
      return Promise.reject(new Error("PERSONAL_WORKSPACE_EXISTS"));
    }

    const id = newId();
    const createdAt = new Date().toISOString();
    const workspace: StoredWorkspace = {
      id,
      name: input.name.trim(),
      slug: normalizedSlug,
      template: input.template,
      timezone: "Asia/Tehran",
      displayUnit: "toman",
      createdBy: input.actorUserId,
      createdAt,
    };
    this.workspaces.set(id, workspace);
    this.memberships.set(`${id}:${input.actorUserId}`, {
      workspaceId: id,
      userId: input.actorUserId,
      role: "owner",
      defaultShares: 1,
      joinedAt: createdAt,
    });
    if (input.template === "personal") {
      this.personalByUser.set(input.actorUserId, id);
    }

    return Promise.resolve({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      template: workspace.template,
      timezone: workspace.timezone,
      displayUnit: workspace.displayUnit,
    });
  }

  async ensurePersonalWorkspace(userId: string): Promise<WorkspaceSummary> {
    const mappedId = this.personalByUser.get(userId);
    if (mappedId) {
      const mapped = this.workspaces.get(mappedId);
      if (mapped) {
        return {
          id: mapped.id,
          name: mapped.name,
          slug: mapped.slug,
          template: mapped.template,
          timezone: mapped.timezone,
          displayUnit: mapped.displayUnit,
        };
      }
    }

    const legacy = (await this.listWorkspacesForUser(userId)).find(
      (w) => w.template === "personal",
    );
    if (legacy) {
      if (!this.personalByUser.has(userId)) {
        this.personalByUser.set(userId, legacy.id);
      }
      return legacy;
    }

    const slug = `me-${userId.replaceAll("-", "").slice(0, 12)}-${Date.now().toString(36).slice(-4)}`;
    try {
      return await this.createWorkspace({
        actorUserId: userId,
        name: "دفتر من",
        slug,
        template: "personal",
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message === "PERSONAL_WORKSPACE_EXISTS" ||
          error.message === "WORKSPACE_SLUG_TAKEN")
      ) {
        const againId = this.personalByUser.get(userId);
        const again = againId ? this.workspaces.get(againId) : undefined;
        if (again) {
          return {
            id: again.id,
            name: again.name,
            slug: again.slug,
            template: again.template,
            timezone: again.timezone,
            displayUnit: again.displayUnit,
          };
        }
      }
      throw error;
    }
  }

  getWorkspaceForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceSummary | undefined> {
    const membership = this.memberships.get(`${workspaceId}:${userId}`);
    if (!membership) return Promise.resolve(undefined);
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return Promise.resolve(undefined);
    return Promise.resolve({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      template: workspace.template,
      timezone: workspace.timezone,
      displayUnit: workspace.displayUnit,
    });
  }

  listMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MembershipSummary[] | undefined> {
    if (!this.memberships.has(`${workspaceId}:${actorUserId}`)) {
      return Promise.resolve(undefined);
    }

    const members: MembershipSummary[] = [];
    for (const membership of this.memberships.values()) {
      if (membership.workspaceId !== workspaceId) continue;
      const user = this.users.get(membership.userId);
      if (!user) continue;
      members.push({
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        displayName: user.displayName,
        role: membership.role,
        defaultShares: membership.defaultShares ?? 1,
        joinedAt: membership.joinedAt,
      });
    }
    return Promise.resolve(members);
  }

  setMemberDefaultShares(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
    defaultShares: number,
  ): Promise<MembershipSummary | undefined> {
    const actor = this.memberships.get(`${workspaceId}:${actorUserId}`);
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
      return Promise.resolve(undefined);
    }
    const target = this.memberships.get(`${workspaceId}:${targetUserId}`);
    if (!target) return Promise.resolve(undefined);
    const updated = { ...target, defaultShares };
    this.memberships.set(`${workspaceId}:${targetUserId}`, updated);
    const user = this.users.get(targetUserId);
    if (!user) return Promise.resolve(undefined);
    return Promise.resolve({
      workspaceId,
      userId: targetUserId,
      displayName: user.displayName,
      role: updated.role,
      defaultShares,
      joinedAt: updated.joinedAt,
    });
  }

  createInvite(input: CreateInviteInput): Promise<CreateInviteResponse> {
    const actorMembership = this.memberships.get(
      `${input.workspaceId}:${input.actorUserId}`,
    );
    if (!actorMembership || !INVITE_OWNER_ROLES.includes(actorMembership.role)) {
      return Promise.reject(new Error("INVITE_FORBIDDEN"));
    }

    const hours = input.expiresInHours ?? 72;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
    const id = newId();
    const rawToken = `${input.workspaceId}.${issueInviteToken()}`;
    const invite: StoredInvite = {
      id,
      workspaceId: input.workspaceId,
      tokenHash: hashInviteToken(rawToken),
      role: input.role,
      invitedSubject: input.invitedSubject?.trim() || undefined,
      invitedByUserId: input.actorUserId,
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
    };
    this.invites.set(id, invite);

    const summary = toInviteSummary(invite);
    return Promise.resolve({
      ...summary,
      token: rawToken,
      acceptPath: `/invite?token=${encodeURIComponent(rawToken)}`,
    });
  }

  listInvites(
    workspaceId: string,
    actorUserId: string,
  ): Promise<InviteSummary[] | undefined> {
    const actorMembership = this.memberships.get(`${workspaceId}:${actorUserId}`);
    if (!actorMembership) return Promise.resolve(undefined);

    const result: InviteSummary[] = [];
    for (const invite of this.invites.values()) {
      if (invite.workspaceId !== workspaceId) continue;
      result.push(toInviteSummary(invite));
    }
    return Promise.resolve(result);
  }

  acceptInvite(token: string, actor: AuthActor): Promise<WorkspaceSummary> {
    const workspaceId = token.split(".")[0];
    if (!workspaceId) {
      return Promise.reject(new Error("INVITE_INVALID"));
    }

    const tokenHash = hashInviteToken(token);
    let matched: StoredInvite | undefined;
    for (const invite of this.invites.values()) {
      if (invite.tokenHash === tokenHash) {
        matched = invite;
        break;
      }
    }

    if (!matched || matched.workspaceId !== workspaceId) {
      return Promise.reject(new Error("INVITE_INVALID"));
    }
    if (matched.acceptedAt) {
      return Promise.reject(new Error("INVITE_ALREADY_USED"));
    }
    if (new Date(matched.expiresAt).getTime() < Date.now()) {
      return Promise.reject(new Error("INVITE_EXPIRED"));
    }

    const workspace = this.workspaces.get(matched.workspaceId);
    if (!workspace) {
      return Promise.reject(new Error("INVITE_INVALID"));
    }

    const membershipKey = `${matched.workspaceId}:${actor.userId}`;
    if (!this.memberships.has(membershipKey)) {
      this.memberships.set(membershipKey, {
        workspaceId: matched.workspaceId,
        userId: actor.userId,
        role: matched.role,
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      });
    }

    matched.acceptedAt = new Date().toISOString();
    matched.acceptedByUserId = actor.userId;

    return Promise.resolve({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      template: workspace.template,
      timezone: workspace.timezone,
      displayUnit: workspace.displayUnit,
    });
  }

  listActiveRolesForUser(userId: string): Promise<MembershipRole[]> {
    const roles: MembershipRole[] = [];
    for (const membership of this.memberships.values()) {
      if (membership.userId === userId) roles.push(membership.role);
    }
    return Promise.resolve(roles);
  }
}

export const memoryIamStore = new MemoryIamStore();
