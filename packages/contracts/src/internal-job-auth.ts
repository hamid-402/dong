import { createHmac, timingSafeEqual } from "node:crypto";

/** Internal job request signing (worker → API). */
export const INTERNAL_JOB_MAX_SKEW_MS = 5 * 60_000;

export const INTERNAL_DIGEST_WORKSPACE_ID = "system";
export const INTERNAL_DIGEST_ACTOR_USER_ID = "system:digest";

/** Platform retention sweep (statements expiry + safe attachment clear). */
export const INTERNAL_RETENTION_WORKSPACE_ID = "system";
export const INTERNAL_RETENTION_ACTOR_USER_ID = "system:retention";

function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Current + optional previous token for verify during rotation (R10-06). */
export function resolveInternalJobSecrets(env: {
  DANG_INTERNAL_JOB_TOKEN?: string;
  DANG_INTERNAL_JOB_TOKEN_PREVIOUS?: string;
}): string[] {
  const current = env.DANG_INTERNAL_JOB_TOKEN?.trim();
  const previous = env.DANG_INTERNAL_JOB_TOKEN_PREVIOUS?.trim();
  const secrets: string[] = [];
  if (current) secrets.push(current);
  if (previous && (!current || !timingSafeStringEqual(previous, current))) {
    secrets.push(previous);
  }
  return secrets;
}

export function signInternalJobPayload(input: {
  secret: string;
  ts: number;
  workspaceId: string;
  actorUserId: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.ts}\n${input.workspaceId}\n${input.actorUserId}`)
    .digest("base64url");
}

export function verifyInternalJobPayload(input: {
  secret: string;
  ts: number;
  workspaceId: string;
  actorUserId: string;
  signature: string;
  nowMs?: number;
  maxSkewMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const skew = input.maxSkewMs ?? INTERNAL_JOB_MAX_SKEW_MS;
  if (!Number.isFinite(input.ts) || Math.abs(now - input.ts) > skew) {
    return false;
  }
  const expected = signInternalJobPayload({
    secret: input.secret,
    ts: input.ts,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
  });
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Match bearer token to current/previous secret, then verify HMAC with that secret.
 */
export function verifyInternalJobAuth(input: {
  secrets: string[];
  suppliedToken: string;
  ts: number;
  workspaceId: string;
  actorUserId: string;
  signature: string;
  nowMs?: number;
  maxSkewMs?: number;
}): boolean {
  const matched = input.secrets.find((secret) =>
    timingSafeStringEqual(secret, input.suppliedToken),
  );
  if (!matched) return false;
  return verifyInternalJobPayload({
    secret: matched,
    ts: input.ts,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    signature: input.signature,
    nowMs: input.nowMs,
    maxSkewMs: input.maxSkewMs,
  });
}

/** Build signed headers for worker → API internal calls. */
export function buildInternalJobHeaders(input: {
  secret: string;
  workspaceId: string;
  actorUserId: string;
  ts?: number;
}): Record<string, string> {
  const ts = input.ts ?? Date.now();
  return {
    "x-dang-internal-job": input.secret,
    "x-dang-internal-actor-user-id": input.actorUserId,
    "x-dang-internal-workspace-id": input.workspaceId,
    "x-dang-internal-ts": String(ts),
    "x-dang-internal-sig": signInternalJobPayload({
      secret: input.secret,
      ts,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
    }),
  };
}
