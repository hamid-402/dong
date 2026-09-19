import { randomUUID } from "node:crypto";
import type {
  CreateWorkspaceWebhookRequest,
  WorkspaceWebhookSummary,
} from "@dang/contracts";
import type { WorkspaceWebhookRecord, WorkspaceWebhookStore } from "./webhook.store.js";

function toSummary(row: WorkspaceWebhookRecord): WorkspaceWebhookSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    url: row.url,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt,
    hasSecret: Boolean(row.secret),
  };
}

export class MemoryWorkspaceWebhookStore implements WorkspaceWebhookStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, WorkspaceWebhookRecord>();
  private readonly idempotency = new Map<string, string>();

  async create(
    _actorUserId: string,
    input: CreateWorkspaceWebhookRequest,
  ): Promise<WorkspaceWebhookRecord> {
    const prior = this.idempotency.get(input.idempotencyKey);
    if (prior) {
      const existing = this.rows.get(prior);
      if (existing) return { ...existing };
    }
    const id = randomUUID();
    const row: WorkspaceWebhookRecord = {
      id,
      workspaceId: input.workspaceId,
      url: input.url,
      events: [...input.events],
      active: true,
      createdAt: new Date().toISOString(),
      hasSecret: true,
      secret: input.secret,
    };
    this.rows.set(id, row);
    this.idempotency.set(input.idempotencyKey, id);
    return { ...row };
  }

  async list(workspaceId: string): Promise<WorkspaceWebhookSummary[]> {
    return [...this.rows.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .map(toSummary);
  }

  async getActiveForEvent(
    workspaceId: string,
    eventType: string,
  ): Promise<WorkspaceWebhookRecord[]> {
    return [...this.rows.values()].filter(
      (r) =>
        r.workspaceId === workspaceId &&
        r.active &&
        r.events.includes(eventType),
    );
  }

  async deactivate(
    workspaceId: string,
    webhookId: string,
  ): Promise<WorkspaceWebhookSummary | null> {
    const row = this.rows.get(webhookId);
    if (!row || row.workspaceId !== workspaceId) return null;
    const next = { ...row, active: false };
    this.rows.set(webhookId, next);
    return toSummary(next);
  }
}
