import {
  and,
  createDatabase,
  eq,
  guestPlaceholder,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateGuestPlaceholderRequest,
  GuestPlaceholderSummary,
} from "@dang/contracts";
import type {
  GuestPlaceholderRecord,
  GuestPlaceholderStore,
} from "./guest-placeholder.store.js";

function mapRow(row: typeof guestPlaceholder.$inferSelect): GuestPlaceholderRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    displayName: row.displayName,
    phoneE164: row.phoneE164 ?? undefined,
    claimTokenHash: row.claimTokenHash,
    claimedUserId: row.claimedUserId ?? undefined,
    claimedAt: row.claimedAt?.toISOString(),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    idempotencyKey: row.idempotencyKey,
  };
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

export class PostgresGuestPlaceholderStore implements GuestPlaceholderStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresGuestPlaceholderStore {
    return new PostgresGuestPlaceholderStore(createDatabase(url).db);
  }

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
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(guestPlaceholder)
          .where(
            and(
              eq(guestPlaceholder.workspaceId, workspaceId),
              eq(guestPlaceholder.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) {
          return {
            ...toPublic(mapRow(existing[0])),
            claimToken,
            claimPath: `/invite/guest-claim?token=${encodeURIComponent(claimToken)}`,
          };
        }
        const inserted = await tx
          .insert(guestPlaceholder)
          .values({
            workspaceId,
            displayName: name,
            phoneE164: input.phoneE164?.trim() || null,
            claimTokenHash,
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        if (!inserted[0]) throw new Error("GUEST_INSERT_FAILED");
        return {
          ...toPublic(mapRow(inserted[0])),
          claimToken,
          claimPath: `/invite/guest-claim?token=${encodeURIComponent(claimToken)}`,
        };
      },
    );
  }

  list(workspaceId: string): Promise<GuestPlaceholderSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(guestPlaceholder)
        .where(eq(guestPlaceholder.workspaceId, workspaceId));
      return rows
        .map((r) => toPublic(mapRow(r)))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "fa"));
    });
  }

  getById(
    workspaceId: string,
    placeholderId: string,
  ): Promise<GuestPlaceholderRecord | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(guestPlaceholder)
        .where(
          and(
            eq(guestPlaceholder.id, placeholderId),
            eq(guestPlaceholder.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : undefined;
    });
  }

  getByClaimTokenHash(
    claimTokenHash: string,
  ): Promise<GuestPlaceholderRecord | undefined> {
    // Cross-tenant lookup by hash (token is the authz secret).
    return this.db
      .select()
      .from(guestPlaceholder)
      .where(eq(guestPlaceholder.claimTokenHash, claimTokenHash))
      .limit(1)
      .then((rows) => (rows[0] ? mapRow(rows[0]) : undefined));
  }

  markClaimed(
    workspaceId: string,
    placeholderId: string,
    userId: string,
  ): Promise<GuestPlaceholderSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(guestPlaceholder)
          .where(
            and(
              eq(guestPlaceholder.id, placeholderId),
              eq(guestPlaceholder.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new Error("GUEST_NOT_FOUND");
        if (rows[0].claimedUserId) throw new Error("GUEST_ALREADY_CLAIMED");
        const updated = await tx
          .update(guestPlaceholder)
          .set({ claimedUserId: userId, claimedAt: new Date() })
          .where(eq(guestPlaceholder.id, placeholderId))
          .returning();
        return toPublic(mapRow(updated[0]!));
      },
    );
  }
}
