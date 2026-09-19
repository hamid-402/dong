import { createHash } from "node:crypto";

/** Canonical fields for audit event hash-chain (R10-04). */
export type AuditHashInput = {
  id: string;
  workspaceId: string;
  actorUserId: string | null | undefined;
  action: string;
  targetType: string;
  targetId: string | null | undefined;
  result: string;
  occurredAtIso: string;
  prevHash: string | null;
};

/**
 * SHA-256 hex over a stable newline-joined payload.
 * Genesis uses prevHash=null → literal "GENESIS".
 */
export function computeAuditEventHash(input: AuditHashInput): string {
  const lines = [
    input.id,
    input.workspaceId,
    input.actorUserId ?? "",
    input.action,
    input.targetType,
    input.targetId ?? "",
    input.result,
    input.occurredAtIso,
    input.prevHash ?? "GENESIS",
  ];
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function verifyAuditEventHash(
  input: AuditHashInput,
  expectedHash: string,
): boolean {
  return computeAuditEventHash(input) === expectedHash;
}
