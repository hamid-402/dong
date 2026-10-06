import type {
  CreateWorkspaceWebhookRequest,
  WorkspaceWebhookDeliverySummary,
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
  recordDelivery(input: {
    workspaceId: string;
    webhookId: string;
    eventType: string;
    ok: boolean;
    statusCode?: number;
    detail: string;
  }): Promise<WorkspaceWebhookDeliverySummary>;
  listDeliveries(
    workspaceId: string,
    opts?: { webhookId?: string; limit?: number },
  ): Promise<WorkspaceWebhookDeliverySummary[]>;
};

export const WORKSPACE_WEBHOOK_STORE = Symbol("WORKSPACE_WEBHOOK_STORE");
