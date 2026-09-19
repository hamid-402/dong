import type {
  CreateWorkspaceWebhookRequest,
  WorkspaceWebhookSummary,
} from "@dang/contracts";

export type WorkspaceWebhookRecord = WorkspaceWebhookSummary & {
  secret: string;
};

export type WorkspaceWebhookStore = {
  readonly persistence: "memory" | "postgres";
  create(
    actorUserId: string,
    input: CreateWorkspaceWebhookRequest,
  ): Promise<WorkspaceWebhookRecord>;
  list(workspaceId: string): Promise<WorkspaceWebhookSummary[]>;
  getActiveForEvent(
    workspaceId: string,
    eventType: string,
  ): Promise<WorkspaceWebhookRecord[]>;
  deactivate(workspaceId: string, webhookId: string): Promise<WorkspaceWebhookSummary | null>;
};

export const WORKSPACE_WEBHOOK_STORE = Symbol("WORKSPACE_WEBHOOK_STORE");
