import { createHash, randomBytes } from "node:crypto";
import type {
  ClaimGuestPlaceholderResponse,
  CreateGuestPlaceholderRequest,
  GuestPlaceholderSummary,
} from "@dang/contracts";

export type GuestPlaceholderRecord = GuestPlaceholderSummary & {
  claimTokenHash: string;
  idempotencyKey: string;
};

export type GuestPlaceholderStore = {
  readonly persistence: "memory" | "postgres";
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateGuestPlaceholderRequest,
    claimToken: string,
    claimTokenHash: string,
  ): Promise<GuestPlaceholderSummary>;
  list(workspaceId: string): Promise<GuestPlaceholderSummary[]>;
  getById(
    workspaceId: string,
    placeholderId: string,
  ): Promise<GuestPlaceholderRecord | undefined>;
  getByClaimTokenHash(
    claimTokenHash: string,
  ): Promise<GuestPlaceholderRecord | undefined>;
  markClaimed(
    workspaceId: string,
    placeholderId: string,
    userId: string,
  ): Promise<GuestPlaceholderSummary>;
};

export const GUEST_PLACEHOLDER_STORE = Symbol("GUEST_PLACEHOLDER_STORE");

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export class MemoryGuestPlaceholderStore implements GuestPlaceholderStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, GuestPlaceholderRecord>();
  private readonly idempotency = new Map<string, string>();

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateGuestPlaceholderRequest,
    claimToken: string,
    claimTokenHash: string,
  ): Promise<GuestPlaceholderSummary> {
    const name = input.displayName?.trim();
    if (!name || name.length > 80) {
      return Promise.reject(new Error("GUEST_NAME"));
    }
    const idemKey = `${workspaceId}:${input.idempotencyKey.trim()}`;
    const existingId = this.idempotency.get(idemKey);
    if (existingId) {
      const existing = this.rows.get(existingId);
      if (existing) {
        return Promise.resolve({
          ...toPublic(existing),
          claimToken,
          claimPath: `/invite/guest-claim?token=${encodeURIComponent(claimToken)}`,
        });
      }
    }
    const id = crypto.randomUUID();
    const row: GuestPlaceholderRecord = {
      id,
      workspaceId,
      displayName: name,
      phoneE164: input.phoneE164?.trim() || undefined,
      claimTokenHash,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.rows.set(id, row);
    this.idempotency.set(idemKey, id);
    return Promise.resolve({
      ...toPublic(row),
      claimToken,
      claimPath: `/invite/guest-claim?token=${encodeURIComponent(claimToken)}`,
    });
  }

  list(workspaceId: string): Promise<GuestPlaceholderSummary[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .map(toPublic)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "fa")),
    );
  }

  getById(
    workspaceId: string,
    placeholderId: string,
  ): Promise<GuestPlaceholderRecord | undefined> {
    const row = this.rows.get(placeholderId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(row);
  }

  getByClaimTokenHash(
    claimTokenHash: string,
  ): Promise<GuestPlaceholderRecord | undefined> {
    for (const row of this.rows.values()) {
      if (row.claimTokenHash === claimTokenHash) return Promise.resolve(row);
    }
    return Promise.resolve(undefined);
  }

  markClaimed(
    workspaceId: string,
    placeholderId: string,
    userId: string,
  ): Promise<GuestPlaceholderSummary> {
    const row = this.rows.get(placeholderId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("GUEST_NOT_FOUND"));
    }
    if (row.claimedUserId) {
      return Promise.reject(new Error("GUEST_ALREADY_CLAIMED"));
    }
    const updated: GuestPlaceholderRecord = {
      ...row,
      claimedUserId: userId,
      claimedAt: new Date().toISOString(),
    };
    this.rows.set(placeholderId, updated);
    return Promise.resolve(toPublic(updated));
  }
}

function toPublic(row: GuestPlaceholderRecord): GuestPlaceholderSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    displayName: row.displayName,
    phoneE164: row.phoneE164,
    claimedUserId: row.claimedUserId,
    claimedAt: row.claimedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

export type { ClaimGuestPlaceholderResponse };
