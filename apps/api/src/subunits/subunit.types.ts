import type {
  CreateWorkspaceSubunitBody,
  UpdateWorkspaceSubunitBody,
  WorkspaceSubunitSummary,
} from "@dang/contracts";

export const WORKSPACE_SUBUNIT_STORE = Symbol("WORKSPACE_SUBUNIT_STORE");

export type WorkspaceSubunitStore = {
  readonly persistence: "memory" | "postgres";
  list(workspaceId: string, actorUserId: string): Promise<WorkspaceSubunitSummary[]>;
  create(
    workspaceId: string,
    actorUserId: string,
    body: CreateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary>;
  update(
    workspaceId: string,
    subunitId: string,
    actorUserId: string,
    body: UpdateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary>;
  remove(workspaceId: string, subunitId: string, actorUserId: string): Promise<void>;
};
