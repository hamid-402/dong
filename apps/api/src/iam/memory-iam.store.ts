import type {
  AuthActor,
  CreateInviteResponse,
  InviteSummary,
  JoinRequestSummary,
  MembershipAddedVia,
  MembershipRole,
  MembershipSummary,
  OwnershipTransferSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import {
  inviteSatisfiesFinanceQuorum,
  isFinanceManagerRole,
  spaceKindForTemplate,
} from "@dang/contracts";
import type {
  AddMemberByUserIdInput,
  ChangeMemberRoleInput,
  CreateInviteInput,
  CreateJoinRequestInput,
  CreateWorkspaceInput,
  DecideJoinRequestInput,
  DisableMemberInput,
  IamStore,
  ProposeOwnershipTransferInput,
  UpdateWorkspaceProfileInput,
  UpsertDevActorInput,
} from "./iam.types.js";
import { INVITE_OWNER_ROLES } from "./iam.types.js";
import { hashInviteToken, issueInviteToken } from "./invite-token.js";
import {
  ASSIGNABLE_MEMBER_ROLES,
  isActiveMember,
  isMembershipManager,
  wouldRemoveLastFinanceManager,
} from "./membership-rules.js";

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
  disabledAt?: string;
  disabledByUserId?: string;
  disabledReason?: string;
  addedVia: MembershipAddedVia;
  addedByUserId?: string;
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

type StoredJoinRequest = {
  id: string;
  workspaceId: string;
  userId: string;
  message?: string;
  status: JoinRequestSummary["status"];
  requestedAt: string;
  decidedAt?: string;
  decidedByUserId?: string;
  grantedRole?: MembershipRole;
};

type StoredOwnershipTransfer = {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  status: OwnershipTransferSummary["status"];
  createdAt: string;
  decidedAt?: string;
  expiresAt: string;
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
  private readonly joinRequests = new Map<string, StoredJoinRequest>();
  private readonly ownershipTransfers = new Map<string, StoredOwnershipTransfer>();
  /** Canonical personal workspace id per user. */
  private readonly personalByUser = new Map<string, string>();

  private toMemberSummary(membership: StoredMembership): MembershipSummary | undefined {
    const user = this.users.get(membership.userId);
    if (!user) return undefined;
    return {
      workspaceId: membership.workspaceId,
      userId: membership.userId,
      displayName: user.displayName,
      role: membership.role,
      defaultShares: membership.defaultShares ?? 1,
      joinedAt: membership.joinedAt,
      disabledAt: membership.disabledAt,
      disabledReason: membership.disabledReason,
      addedVia: membership.addedVia,
      addedByUserId: membership.addedByUserId,
    };
  }

  private workspaceMembers(workspaceId: string): StoredMembership[] {
    return [...this.memberships.values()].filter((m) => m.workspaceId === workspaceId);
  }

  private requireActiveManager(
    workspaceId: string,
    actorUserId: string,
  ): StoredMembership {
    const actor = this.memberships.get(`${workspaceId}:${actorUserId}`);
    if (!actor || !isActiveMember(actor) || !isMembershipManager(actor.role)) {
      throw new Error("MEMBERSHIP_FORBIDDEN");
    }
    return actor;
  }

  private toJoinSummary(row: StoredJoinRequest): JoinRequestSummary {
    const user = this.users.get(row.userId);
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      displayName: user?.displayName ?? row.userId,
      message: row.message,
      status: row.status,
      requestedAt: row.requestedAt,
      decidedAt: row.decidedAt,
      decidedByUserId: row.decidedByUserId,
      grantedRole: row.grantedRole,
    };
  }

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
      if (!isActiveMember(membership)) continue;
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
      displayUnit: "rial",
      createdBy: input.actorUserId,
      createdAt,
    };
    this.workspaces.set(id, workspace);
    if (!this.users.has(input.actorUserId)) {
      this.users.set(input.actorUserId, {
        id: input.actorUserId,
        externalSubject: `local:${input.actorUserId}`,
        displayName: input.actorUserId,
      });
    }
    this.memberships.set(`${id}:${input.actorUserId}`, {
      workspaceId: id,
      userId: input.actorUserId,
      role: "owner",
      defaultShares: 1,
      joinedAt: createdAt,
      addedVia: "seed",
      addedByUserId: input.actorUserId,
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

  updateWorkspaceProfile(
    input: UpdateWorkspaceProfileInput,
  ): Promise<WorkspaceSummary | undefined> {
    const membership = this.memberships.get(
      `${input.workspaceId}:${input.actorUserId}`,
    );
    if (
      !membership ||
      !isActiveMember(membership) ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return Promise.reject(new Error("WORKSPACE_UPDATE_FORBIDDEN"));
    }
    const current = this.workspaces.get(input.workspaceId);
    if (!current) return Promise.resolve(undefined);
    const updated: StoredWorkspace = {
      ...current,
      name: input.name,
      timezone: input.timezone,
      displayUnit: input.displayUnit,
    };
    this.workspaces.set(updated.id, updated);
    return Promise.resolve({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      template: updated.template,
      timezone: updated.timezone,
      displayUnit: updated.displayUnit,
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
    if (!membership || !isActiveMember(membership)) {
      return Promise.resolve(undefined);
    }
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

  getWorkspaceBySlug(slug: string): Promise<WorkspaceSummary | undefined> {
    const normalized = slug.trim().toLowerCase();
    for (const workspace of this.workspaces.values()) {
      if (workspace.slug === normalized) {
        return Promise.resolve({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          template: workspace.template,
          timezone: workspace.timezone,
          displayUnit: workspace.displayUnit,
        });
      }
    }
    return Promise.resolve(undefined);
  }

  listMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MembershipSummary[] | undefined> {
    const actor = this.memberships.get(`${workspaceId}:${actorUserId}`);
    if (!actor || !isActiveMember(actor)) return Promise.resolve(undefined);

    const members: MembershipSummary[] = [];
    for (const membership of this.workspaceMembers(workspaceId)) {
      const summary = this.toMemberSummary(membership);
      if (summary) members.push(summary);
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
    if (
      !actor ||
      !isActiveMember(actor) ||
      (actor.role !== "owner" && actor.role !== "admin")
    ) {
      return Promise.resolve(undefined);
    }
    const target = this.memberships.get(`${workspaceId}:${targetUserId}`);
    if (!target || !isActiveMember(target)) return Promise.resolve(undefined);
    const updated = { ...target, defaultShares };
    this.memberships.set(`${workspaceId}:${targetUserId}`, updated);
    return Promise.resolve(this.toMemberSummary(updated));
  }

  addMemberByUserId(input: AddMemberByUserIdInput): Promise<MembershipSummary> {
    this.requireActiveManager(input.workspaceId, input.actorUserId);
    if (!this.users.has(input.userId)) {
      return Promise.reject(new Error("CANNOT_CREATE_USER_ACCOUNT"));
    }
    if (input.role === "owner" || !ASSIGNABLE_MEMBER_ROLES.includes(input.role)) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    const key = `${input.workspaceId}:${input.userId}`;
    const existing = this.memberships.get(key);
    if (existing && isActiveMember(existing)) {
      return Promise.reject(new Error("MEMBER_ALREADY_EXISTS"));
    }
    const workspace = this.workspaces.get(input.workspaceId);
    if (!workspace) return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));

    const members = this.workspaceMembers(input.workspaceId).filter(isActiveMember);
    const financeCount = members.filter((m) => isFinanceManagerRole(m.role)).length;
    const quorum = inviteSatisfiesFinanceQuorum({
      spaceKind: spaceKindForTemplate(workspace.template),
      currentMemberCount: members.length,
      currentFinanceManagerCount: financeCount,
      inviteRole: input.role,
    });
    if (!quorum.ok) {
      return Promise.reject(new Error("FINANCE_QUORUM_REQUIRED"));
    }

    const joinedAt = existing?.joinedAt ?? new Date().toISOString();
    const row: StoredMembership = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      defaultShares: input.defaultShares ?? 1,
      joinedAt,
      addedVia: input.addedVia,
      addedByUserId: input.actorUserId,
    };
    this.memberships.set(key, row);
    const summary = this.toMemberSummary(row);
    if (!summary) return Promise.reject(new Error("CANNOT_CREATE_USER_ACCOUNT"));
    return Promise.resolve(summary);
  }

  changeMemberRole(input: ChangeMemberRoleInput): Promise<MembershipSummary> {
    this.requireActiveManager(input.workspaceId, input.actorUserId);
    const target = this.memberships.get(
      `${input.workspaceId}:${input.targetUserId}`,
    );
    if (!target || !isActiveMember(target)) {
      return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    }
    if (input.role === "owner") {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    if (input.role !== undefined && !ASSIGNABLE_MEMBER_ROLES.includes(input.role)) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    if (
      input.role !== undefined &&
      wouldRemoveLastFinanceManager(this.workspaceMembers(input.workspaceId), input.targetUserId, {
        nextRole: input.role,
      })
    ) {
      return Promise.reject(new Error("LAST_FINANCE_MANAGER"));
    }
    // Owner handoff is two-step transfer only (even when other finance managers exist).
    if (target.role === "owner" && input.role !== undefined) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    const updated: StoredMembership = {
      ...target,
      role: input.role ?? target.role,
      defaultShares: input.defaultShares ?? target.defaultShares,
    };
    this.memberships.set(`${input.workspaceId}:${input.targetUserId}`, updated);
    const summary = this.toMemberSummary(updated);
    if (!summary) return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    return Promise.resolve(summary);
  }

  disableMember(input: DisableMemberInput): Promise<MembershipSummary> {
    this.requireActiveManager(input.workspaceId, input.actorUserId);
    if (input.targetUserId === input.actorUserId) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    const target = this.memberships.get(
      `${input.workspaceId}:${input.targetUserId}`,
    );
    if (!target || !isActiveMember(target)) {
      return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    }
    if (target.role === "owner") {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    if (
      wouldRemoveLastFinanceManager(this.workspaceMembers(input.workspaceId), input.targetUserId, {
        disabling: true,
      })
    ) {
      return Promise.reject(new Error("LAST_FINANCE_MANAGER"));
    }
    const updated: StoredMembership = {
      ...target,
      disabledAt: new Date().toISOString(),
      disabledByUserId: input.actorUserId,
      disabledReason: input.reason,
    };
    this.memberships.set(`${input.workspaceId}:${input.targetUserId}`, updated);
    const summary = this.toMemberSummary(updated);
    if (!summary) return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    return Promise.resolve(summary);
  }

  enableMember(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<MembershipSummary> {
    this.requireActiveManager(workspaceId, actorUserId);
    const target = this.memberships.get(`${workspaceId}:${targetUserId}`);
    if (!target || isActiveMember(target)) {
      return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    }
    const updated: StoredMembership = {
      ...target,
      disabledAt: undefined,
      disabledByUserId: undefined,
      disabledReason: undefined,
    };
    this.memberships.set(`${workspaceId}:${targetUserId}`, updated);
    const summary = this.toMemberSummary(updated);
    if (!summary) return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    return Promise.resolve(summary);
  }

  listJoinRequests(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JoinRequestSummary[] | undefined> {
    try {
      this.requireActiveManager(workspaceId, actorUserId);
    } catch {
      return Promise.resolve(undefined);
    }
    const rows = [...this.joinRequests.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .map((r) => this.toJoinSummary(r));
    return Promise.resolve(rows);
  }

  createJoinRequest(input: CreateJoinRequestInput): Promise<JoinRequestSummary> {
    if (!this.workspaces.has(input.workspaceId)) {
      return Promise.reject(new Error("WORKSPACE_NOT_FOUND"));
    }
    const existingMembership = this.memberships.get(
      `${input.workspaceId}:${input.userId}`,
    );
    if (existingMembership && isActiveMember(existingMembership)) {
      return Promise.reject(new Error("MEMBER_ALREADY_EXISTS"));
    }
    for (const row of this.joinRequests.values()) {
      if (
        row.workspaceId === input.workspaceId &&
        row.userId === input.userId &&
        row.status === "pending"
      ) {
        return Promise.reject(new Error("JOIN_REQUEST_PENDING"));
      }
    }
    const row: StoredJoinRequest = {
      id: newId(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      message: input.message?.trim() || undefined,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    this.joinRequests.set(row.id, row);
    return Promise.resolve(this.toJoinSummary(row));
  }

  approveJoinRequest(input: DecideJoinRequestInput): Promise<JoinRequestSummary> {
    this.requireActiveManager(input.workspaceId, input.actorUserId);
    const row = this.joinRequests.get(input.requestId);
    if (!row || row.workspaceId !== input.workspaceId || row.status !== "pending") {
      return Promise.reject(new Error("JOIN_REQUEST_NOT_FOUND"));
    }
    const role = input.role ?? "member";
    if (role === "owner" || !ASSIGNABLE_MEMBER_ROLES.includes(role)) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    return this.addMemberByUserId({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      userId: row.userId,
      role,
      addedVia: "join_request",
    }).then(() => {
      row.status = "approved";
      row.decidedAt = new Date().toISOString();
      row.decidedByUserId = input.actorUserId;
      row.grantedRole = role;
      return this.toJoinSummary(row);
    });
  }

  rejectJoinRequest(input: DecideJoinRequestInput): Promise<JoinRequestSummary> {
    this.requireActiveManager(input.workspaceId, input.actorUserId);
    const row = this.joinRequests.get(input.requestId);
    if (!row || row.workspaceId !== input.workspaceId || row.status !== "pending") {
      return Promise.reject(new Error("JOIN_REQUEST_NOT_FOUND"));
    }
    row.status = "rejected";
    row.decidedAt = new Date().toISOString();
    row.decidedByUserId = input.actorUserId;
    return Promise.resolve(this.toJoinSummary(row));
  }

  withdrawJoinRequest(
    requestId: string,
    userId: string,
  ): Promise<JoinRequestSummary> {
    const row = this.joinRequests.get(requestId);
    if (!row || row.userId !== userId || row.status !== "pending") {
      return Promise.reject(new Error("JOIN_REQUEST_NOT_FOUND"));
    }
    row.status = "withdrawn";
    row.decidedAt = new Date().toISOString();
    return Promise.resolve(this.toJoinSummary(row));
  }

  proposeOwnershipTransfer(
    input: ProposeOwnershipTransferInput,
  ): Promise<OwnershipTransferSummary> {
    const actor = this.memberships.get(`${input.workspaceId}:${input.fromUserId}`);
    if (!actor || !isActiveMember(actor) || actor.role !== "owner") {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    const target = this.memberships.get(`${input.workspaceId}:${input.toUserId}`);
    if (!target || !isActiveMember(target)) {
      return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    }
    if (input.toUserId === input.fromUserId) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    for (const t of this.ownershipTransfers.values()) {
      if (t.workspaceId === input.workspaceId && t.status === "pending") {
        return Promise.reject(new Error("OWNERSHIP_TRANSFER_PENDING"));
      }
    }
    const hours = input.expiresInHours ?? 72;
    const createdAt = new Date();
    const row: StoredOwnershipTransfer = {
      id: newId(),
      workspaceId: input.workspaceId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      status: "pending",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + hours * 60 * 60 * 1000).toISOString(),
    };
    this.ownershipTransfers.set(row.id, row);
    return Promise.resolve(row);
  }

  listOwnershipTransfers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary[] | undefined> {
    const actor = this.memberships.get(`${workspaceId}:${actorUserId}`);
    if (!actor || !isActiveMember(actor)) {
      return Promise.resolve(undefined);
    }
    const now = Date.now();
    const pending: OwnershipTransferSummary[] = [];
    for (const row of this.ownershipTransfers.values()) {
      if (row.workspaceId !== workspaceId || row.status !== "pending") continue;
      if (new Date(row.expiresAt).getTime() < now) {
        row.status = "expired";
        continue;
      }
      pending.push({ ...row });
    }
    return Promise.resolve(pending);
  }

  acceptOwnershipTransfer(
    workspaceId: string,
    transferId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary> {
    const row = this.ownershipTransfers.get(transferId);
    if (!row || row.workspaceId !== workspaceId || row.status !== "pending") {
      return Promise.reject(new Error("OWNERSHIP_TRANSFER_NOT_FOUND"));
    }
    if (row.toUserId !== actorUserId) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      row.status = "expired";
      return Promise.reject(new Error("OWNERSHIP_TRANSFER_EXPIRED"));
    }
    const from = this.memberships.get(`${workspaceId}:${row.fromUserId}`);
    const to = this.memberships.get(`${workspaceId}:${row.toUserId}`);
    if (!from || !to || !isActiveMember(from) || !isActiveMember(to)) {
      return Promise.reject(new Error("MEMBER_NOT_FOUND"));
    }
    if (from.role !== "owner") {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    this.memberships.set(`${workspaceId}:${row.fromUserId}`, {
      ...from,
      role: "admin",
    });
    this.memberships.set(`${workspaceId}:${row.toUserId}`, {
      ...to,
      role: "owner",
    });
    row.status = "accepted";
    row.decidedAt = new Date().toISOString();
    return Promise.resolve(row);
  }

  cancelOwnershipTransfer(
    workspaceId: string,
    transferId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary> {
    const row = this.ownershipTransfers.get(transferId);
    if (!row || row.workspaceId !== workspaceId || row.status !== "pending") {
      return Promise.reject(new Error("OWNERSHIP_TRANSFER_NOT_FOUND"));
    }
    if (row.fromUserId !== actorUserId) {
      return Promise.reject(new Error("MEMBERSHIP_FORBIDDEN"));
    }
    row.status = "cancelled";
    row.decidedAt = new Date().toISOString();
    return Promise.resolve(row);
  }

  createInvite(input: CreateInviteInput): Promise<CreateInviteResponse> {
    const actorMembership = this.memberships.get(
      `${input.workspaceId}:${input.actorUserId}`,
    );
    if (
      !actorMembership ||
      !isActiveMember(actorMembership) ||
      !INVITE_OWNER_ROLES.includes(actorMembership.role)
    ) {
      // Finance may add existing users but must not mint invite tokens that create accounts.
      if (actorMembership && isMembershipManager(actorMembership.role)) {
        return Promise.reject(new Error("CANNOT_CREATE_USER_ACCOUNT"));
      }
      return Promise.reject(new Error("INVITE_FORBIDDEN"));
    }

    const workspace = this.workspaces.get(input.workspaceId);
    if (!workspace) {
      return Promise.reject(new Error("INVITE_FORBIDDEN"));
    }

    const members = this.workspaceMembers(input.workspaceId).filter(isActiveMember);
    const financeCount = members.filter((m) => isFinanceManagerRole(m.role)).length;
    const quorum = inviteSatisfiesFinanceQuorum({
      spaceKind: spaceKindForTemplate(workspace.template),
      currentMemberCount: members.length,
      currentFinanceManagerCount: financeCount,
      inviteRole: input.role,
    });
    if (!quorum.ok) {
      return Promise.reject(new Error("FINANCE_QUORUM_REQUIRED"));
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
    if (!actorMembership || !isActiveMember(actorMembership)) {
      return Promise.resolve(undefined);
    }

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
        addedVia: "invite",
        addedByUserId: matched.invitedByUserId,
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
      if (membership.userId === userId && isActiveMember(membership)) {
        roles.push(membership.role);
      }
    }
    return Promise.resolve(roles);
  }
}

export const memoryIamStore = new MemoryIamStore();
