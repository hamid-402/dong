import { computeAuditEventHash } from "@dang/contracts";
import type { AuditRecord, AuditStore, AuditWriteInput } from "./audit.types.js";

type ChainedRecord = AuditRecord & {
  eventHash: string;
  prevHash: string | null;
};

export class MemoryAuditStore implements AuditStore {
  readonly persistence = "memory" as const;
  private readonly events: ChainedRecord[] = [];
  private readonly membershipIndex = new Map<string, Set<string>>();

  /** Call when a user joins/creates a workspace so they can read its audit trail. */
  grantReader(workspaceId: string, userId: string): void {
    const key = workspaceId;
    const set = this.membershipIndex.get(key) ?? new Set<string>();
    set.add(userId);
    this.membershipIndex.set(key, set);
  }

  append(input: AuditWriteInput): Promise<AuditRecord> {
    const id = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const prior = [...this.events]
      .filter((e) => e.workspaceId === input.workspaceId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    const prevHash = prior.at(-1)?.eventHash ?? null;
    const eventHash = computeAuditEventHash({
      id,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      result: input.result,
      occurredAtIso: occurredAt,
      prevHash,
    });
    const record: ChainedRecord = {
      ...input,
      id,
      occurredAt,
      metadata: input.metadata ?? {},
      eventHash,
      prevHash,
    };
    this.events.push(record);
    if (input.actorUserId) {
      this.grantReader(input.workspaceId, input.actorUserId);
    }
    return Promise.resolve({
      id: record.id,
      workspaceId: record.workspaceId,
      actorUserId: record.actorUserId,
      action: record.action,
      targetType: record.targetType,
      targetId: record.targetId,
      result: record.result,
      reason: record.reason,
      requestId: record.requestId,
      traceId: record.traceId,
      metadata: record.metadata,
      occurredAt: record.occurredAt,
    });
  }

  /** Test helper — returns chain hashes in append order. */
  chainForWorkspace(workspaceId: string): Array<{
    id: string;
    eventHash: string;
    prevHash: string | null;
  }> {
    return this.events
      .filter((e) => e.workspaceId === workspaceId)
      .map((e) => ({
        id: e.id,
        eventHash: e.eventHash,
        prevHash: e.prevHash,
      }));
  }

  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AuditRecord[] | undefined> {
    const readers = this.membershipIndex.get(workspaceId);
    if (!readers?.has(actorUserId)) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(
      this.events
        .filter((event) => event.workspaceId === workspaceId)
        .map(
          ({
            eventHash: _h,
            prevHash: _p,
            ...rest
          }) => rest,
        ),
    );
  }
}
