import type { AuditRecord, AuditStore, AuditWriteInput } from "./audit.types.js";

export class MemoryAuditStore implements AuditStore {
  readonly persistence = "memory" as const;
  private readonly events: AuditRecord[] = [];
  private readonly membershipIndex = new Map<string, Set<string>>();

  /** Call when a user joins/creates a workspace so they can read its audit trail. */
  grantReader(workspaceId: string, userId: string): void {
    const key = workspaceId;
    const set = this.membershipIndex.get(key) ?? new Set<string>();
    set.add(userId);
    this.membershipIndex.set(key, set);
  }

  append(input: AuditWriteInput): Promise<AuditRecord> {
    const record: AuditRecord = {
      ...input,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };
    this.events.push(record);
    if (input.actorUserId) {
      this.grantReader(input.workspaceId, input.actorUserId);
    }
    return Promise.resolve(record);
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
      this.events.filter((event) => event.workspaceId === workspaceId),
    );
  }
}

export const memoryAuditStore = new MemoryAuditStore();
