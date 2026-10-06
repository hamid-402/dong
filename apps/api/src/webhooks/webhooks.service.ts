import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  roleInSet,
  signWebhookBody,
  WEBHOOK_MANAGER_ROLES,
  type AuthActor,
  type CreateWorkspaceWebhookRequest,
  type WorkspaceWebhookDeliveryResult,
  type WorkspaceWebhookDeliverySummary,
  type WorkspaceWebhookSummary,
} from "@dang/contracts";
import { createLogger } from "@dang/observability";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import {
  WORKSPACE_WEBHOOK_STORE,
  type WorkspaceWebhookStore,
} from "./webhook.store.js";

const logger = createLogger("dang-api-webhooks");

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(WORKSPACE_WEBHOOK_STORE) private readonly store: WorkspaceWebhookStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  get persistence(): "memory" | "postgres" {
    return this.store.persistence;
  }

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateWorkspaceWebhookRequest,
  ): Promise<WorkspaceWebhookSummary> {
    await this.requireManager(workspaceId, actor.userId);
    if (!body.url.startsWith("https://") && !body.url.startsWith("http://localhost")) {
      throw new BadRequestException({
        type: "https://dang.local/problems/bad-request",
        title: "Webhook URL must be https (or localhost for dev)",
        status: 400,
      });
    }
    if (!body.secret || body.secret.length < 16) {
      throw new BadRequestException({
        type: "https://dang.local/problems/bad-request",
        title: "Webhook secret must be at least 16 characters",
        status: 400,
      });
    }
    const row = await this.store.create(actor.userId, {
      ...body,
      workspaceId,
    });
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      url: row.url,
      events: row.events,
      active: row.active,
      createdAt: row.createdAt,
      hasSecret: true,
    };
  }

  async list(actor: AuthActor, workspaceId: string): Promise<WorkspaceWebhookSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.list(workspaceId);
  }

  async listDeliveries(
    actor: AuthActor,
    workspaceId: string,
    opts?: { webhookId?: string; limit?: number },
  ): Promise<WorkspaceWebhookDeliverySummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listDeliveries(workspaceId, opts);
  }

  async deactivate(
    actor: AuthActor,
    workspaceId: string,
    webhookId: string,
  ): Promise<WorkspaceWebhookSummary> {
    await this.requireManager(workspaceId, actor.userId);
    const next = await this.store.deactivate(workspaceId, webhookId);
    if (!next) {
      throw new BadRequestException({
        type: "https://dang.local/problems/bad-request",
        title: "Webhook not found",
        status: 400,
      });
    }
    return next;
  }

  /** Fan-out after outbox commit — best-effort; failures are logged, not thrown. */
  async dispatchEvent(
    workspaceId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<WorkspaceWebhookDeliveryResult[]> {
    const targets = await this.store.getActiveForEvent(workspaceId, eventType);
    const results: WorkspaceWebhookDeliveryResult[] = [];
    for (const hook of targets) {
      const body = JSON.stringify({
        id: crypto.randomUUID(),
        type: eventType,
        workspaceId,
        createdAt: new Date().toISOString(),
        data: payload,
      });
      const timestamp = String(Date.now());
      const signature = signWebhookBody(hook.secret, timestamp, body);
      let result: WorkspaceWebhookDeliveryResult;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-dang-timestamp": timestamp,
            "x-dang-signature": `sha256=${signature}`,
            "x-dang-event": eventType,
          },
          body,
          signal: AbortSignal.timeout(8_000),
        });
        result = {
          ok: res.ok,
          statusCode: res.status,
          detail: res.ok ? "delivered" : `HTTP ${res.status}`,
        };
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        logger.warn("webhook delivery failed", { workspaceId, eventType, detail });
        result = { ok: false, detail };
      }
      results.push(result);
      try {
        await this.store.recordDelivery({
          workspaceId,
          webhookId: hook.id,
          eventType,
          ok: result.ok,
          statusCode: result.statusCode,
          detail: result.detail,
        });
      } catch (err: unknown) {
        logger.warn("webhook delivery log failed", {
          workspaceId,
          eventType,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }

  private async requireManager(workspaceId: string, userId: string): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, userId);
    const self = members?.find((m) => m.userId === userId);
    if (!self || !roleInSet(self.role, WEBHOOK_MANAGER_ROLES)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Webhook manage requires owner/admin/finance",
        status: 403,
        code: "webhook_manage_forbidden",
      });
    }
  }
}
