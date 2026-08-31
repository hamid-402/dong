import type {
  AuthActor,
  CreateInviteRequest,
  CreateInviteResponse,
  InviteSummary,
  MembershipRole,
  MembershipSummary,
  WorkspaceSummary,
  WorkspaceTemplate,
} from "@dang/contracts";

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

export type CreateInviteInput = CreateInviteRequest & {
  workspaceId: string;
  actorUserId: string;
};

export type IamStore = {
  readonly persistence: "memory" | "postgres";
  upsertDevActor(input: UpsertDevActorInput): Promise<AuthActor>;
  listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]>;
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary>;
  getWorkspaceForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceSummary | undefined>;
  listMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MembershipSummary[] | undefined>;
  createInvite(input: CreateInviteInput): Promise<CreateInviteResponse>;
  listInvites(
    workspaceId: string,
    actorUserId: string,
  ): Promise<InviteSummary[] | undefined>;
  acceptInvite(token: string, actor: AuthActor): Promise<WorkspaceSummary>;
};

export const IAM_STORE = Symbol("IAM_STORE");

export const INVITE_OWNER_ROLES: MembershipRole[] = ["owner", "admin"];
