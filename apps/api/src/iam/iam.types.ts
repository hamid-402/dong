import type {
  AuthActor,
  CreateInviteRequest,
  CreateInviteResponse,
  InviteSummary,
  JoinRequestSummary,
  MembershipAddedVia,
  MembershipRole,
  MembershipSummary,
  OwnershipTransferSummary,
  WorkspaceSummary,
  WorkspaceTemplate,
} from "@dang/contracts";
import { INVITE_ADMIN_ROLES } from "@dang/contracts";

export type UpsertDevActorInput = {
  externalSubject: string;
  displayName: string;
  userId?: string;
};

export type CreateWorkspaceInput = {
  actorUserId: string;
  name: string;
  slug: string;
  template: WorkspaceTemplate;
};

export type UpdateWorkspaceProfileInput = {
  workspaceId: string;
  actorUserId: string;
  name: string;
  timezone: string;
  displayUnit: "toman" | "rial";
};

export type CreateInviteInput = CreateInviteRequest & {
  workspaceId: string;
  actorUserId: string;
};

export type AddMemberByUserIdInput = {
  workspaceId: string;
  actorUserId: string;
  userId: string;
  role: MembershipRole;
  defaultShares?: number;
  addedVia: MembershipAddedVia;
};

export type ChangeMemberRoleInput = {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  role?: MembershipRole;
  defaultShares?: number;
};

export type DisableMemberInput = {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  reason: string;
};

export type CreateJoinRequestInput = {
  workspaceId: string;
  userId: string;
  message?: string;
};

export type DecideJoinRequestInput = {
  workspaceId: string;
  requestId: string;
  actorUserId: string;
  role?: MembershipRole;
};

export type ProposeOwnershipTransferInput = {
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  expiresInHours?: number;
};

export type IamStore = {
  readonly persistence: "memory" | "postgres";
  upsertDevActor(input: UpsertDevActorInput): Promise<AuthActor>;
  listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]>;
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary>;
  updateWorkspaceProfile(
    input: UpdateWorkspaceProfileInput,
  ): Promise<WorkspaceSummary | undefined>;
  /** Idempotent: returns existing personal workspace or creates «دفتر من». */
  ensurePersonalWorkspace(userId: string): Promise<WorkspaceSummary>;
  getWorkspaceForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceSummary | undefined>;
  getWorkspaceBySlug(slug: string): Promise<WorkspaceSummary | undefined>;
  listMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MembershipSummary[] | undefined>;
  setMemberDefaultShares(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
    defaultShares: number,
  ): Promise<MembershipSummary | undefined>;
  addMemberByUserId(input: AddMemberByUserIdInput): Promise<MembershipSummary>;
  changeMemberRole(input: ChangeMemberRoleInput): Promise<MembershipSummary>;
  disableMember(input: DisableMemberInput): Promise<MembershipSummary>;
  enableMember(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<MembershipSummary>;
  listJoinRequests(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JoinRequestSummary[] | undefined>;
  createJoinRequest(input: CreateJoinRequestInput): Promise<JoinRequestSummary>;
  approveJoinRequest(input: DecideJoinRequestInput): Promise<JoinRequestSummary>;
  rejectJoinRequest(input: DecideJoinRequestInput): Promise<JoinRequestSummary>;
  withdrawJoinRequest(
    requestId: string,
    userId: string,
  ): Promise<JoinRequestSummary>;
  proposeOwnershipTransfer(
    input: ProposeOwnershipTransferInput,
  ): Promise<OwnershipTransferSummary>;
  /** Pending ownership transfers visible to active members (accept across sessions). */
  listOwnershipTransfers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary[] | undefined>;
  acceptOwnershipTransfer(
    workspaceId: string,
    transferId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary>;
  cancelOwnershipTransfer(
    workspaceId: string,
    transferId: string,
    actorUserId: string,
  ): Promise<OwnershipTransferSummary>;
  createInvite(input: CreateInviteInput): Promise<CreateInviteResponse>;
  listInvites(
    workspaceId: string,
    actorUserId: string,
  ): Promise<InviteSummary[] | undefined>;
  acceptInvite(token: string, actor: AuthActor): Promise<WorkspaceSummary>;
  /** Active membership roles across all workspaces for MFA enrollment checks. */
  listActiveRolesForUser(userId: string): Promise<MembershipRole[]>;
};

export const IAM_STORE = Symbol("IAM_STORE");

export const INVITE_OWNER_ROLES: MembershipRole[] = [...INVITE_ADMIN_ROLES];

/** Roles that may add/disable members and manage join requests (S11-03). */
export const MEMBERSHIP_MANAGER_ROLES: MembershipRole[] = [
  "owner",
  "admin",
  "finance",
];
