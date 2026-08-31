export type AuditWriteInput = {
  workspaceId: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  result: "success" | "failure" | "denied";
  reason?: string;
  requestId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AuditRecord = AuditWriteInput & {
  id: string;
  occurredAt: string;
};

export type AuditStore = {
  readonly persistence: "memory" | "postgres";
  append(input: AuditWriteInput): Promise<AuditRecord>;
  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AuditRecord[] | undefined>;
};

export const AUDIT_STORE = Symbol("AUDIT_STORE");
