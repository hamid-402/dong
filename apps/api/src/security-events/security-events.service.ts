import { ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  securityEventDefaults,
  type AuthActor,
  type SecurityEvent,
  type SecurityEventCategory,
  type SecurityEventListPage,
  type SecurityEventListQuery,
  type SecurityEventName,
  type SecurityEventSeverity,
} from "@dang/contracts";
import { createLogger, getRequestId, getTraceId } from "@dang/observability";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  SECURITY_EVENTS_STORE,
  type SecurityEventsStore,
} from "./security-events.types.js";

const log = createLogger("dang-security-events");

/**
 * R10-15 — emit SIEM-oriented structured security events (JSON logs)
 * and persist to memory ring and/or Postgres `ops.security_event`.
 */
@Injectable()
export class SecurityEventsService {
  constructor(
    @Optional()
    @Inject(SECURITY_EVENTS_STORE)
    private readonly store?: SecurityEventsStore,
    @Optional()
    @Inject(WorkspaceAccessService)
    private readonly access?: WorkspaceAccessService,
  ) {}

  get persistence(): "memory" | "postgres" {
    return this.store?.persistence ?? "memory";
  }

  emit(
    name: SecurityEventName,
    partial: Omit<SecurityEvent, "id" | "event" | "category" | "severity" | "occurredAt"> & {
      category?: SecurityEvent["category"];
      severity?: SecurityEvent["severity"];
      id?: string;
    } = {},
  ): SecurityEvent {
    const defaults = securityEventDefaults(name);
    const event: SecurityEvent = {
      id: partial.id ?? randomUUID(),
      event: name,
      category: partial.category ?? defaults.category,
      severity: partial.severity ?? defaults.severity,
      occurredAt: new Date().toISOString(),
      workspaceId: partial.workspaceId,
      actorUserId: partial.actorUserId,
      targetType: partial.targetType,
      targetId: partial.targetId,
      reason: partial.reason,
      requestId: partial.requestId ?? getRequestId(),
      traceId: partial.traceId ?? getTraceId(),
      attrs: partial.attrs,
    };
    const level =
      event.severity === "critical" || event.severity === "high"
        ? "warn"
        : "info";
    log[level]("security.event", {
      securityEvent: true,
      ...event,
    });
    if (this.store) {
      void this.store.append(event).catch((err: unknown) => {
        log.warn("security.event.persist_failed", {
          detail: err instanceof Error ? err.message : "unknown",
          eventId: event.id,
        });
      });
    }
    return event;
  }

  /**
   * Newest-first page from durable store (Postgres) or in-process ring.
   * Cursor is opaque (occurredAt+id); filters by category/severity/workspaceId.
   */
  async listRecent(input?: SecurityEventListQuery): Promise<SecurityEventListPage> {
    if (!this.store) {
      return { items: [] };
    }
    return this.store.list(input);
  }

  /**
   * Workspace-scoped listing for owner/admin/finance.
   * Always forces workspaceId from the path — never trusts a client-supplied id alone.
   */
  async listForWorkspace(
    actor: AuthActor,
    workspaceId: string,
    query: {
      cursor?: string;
      category?: string;
      severity?: string;
      limit?: number;
    } = {},
  ): Promise<SecurityEventListPage> {
    if (!this.access) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "دسترسی فضای کاری در دسترس نیست",
      });
    }
    await this.access.requireAnyRole(workspaceId, actor.userId, [
      "owner",
      "admin",
      "finance",
    ]);
    const limit =
      typeof query.limit === "number" && Number.isFinite(query.limit)
        ? Math.min(100, Math.max(1, Math.trunc(query.limit)))
        : 50;
    return this.listRecent({
      cursor: query.cursor,
      limit,
      category: query.category as SecurityEventCategory | undefined,
      severity: query.severity as SecurityEventSeverity | undefined,
      workspaceId,
    });
  }

  /** Test helper — await pending append when store is sync/async. */
  async flushAppend(event: SecurityEvent): Promise<void> {
    if (!this.store) return;
    await this.store.append(event);
  }
}
