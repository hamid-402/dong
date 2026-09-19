import {
  and,
  contactSyncRun,
  createDatabase,
  desc,
  eq,
  friendship,
  or,
  userDirectorySetting,
  type AppDatabase,
} from "@dang/db";
import type {
  FriendshipStatus,
  UpdateDirectoryPrivacyRequest,
} from "@dang/contracts";
import {
  friendshipPairKey,
  type ContactSyncRunRecord,
  type DirectorySettingRecord,
  type FriendshipRecord,
  type SocialStore,
} from "./social.types.js";

function mapSettings(row: typeof userDirectorySetting.$inferSelect): DirectorySettingRecord {
  return {
    userId: row.userId,
    findableByUsername: row.findableByUsername,
    findableByPhone: row.findableByPhone,
    findableByEmail: row.findableByEmail,
    allowFriendRequests: row.allowFriendRequests,
    allowGroupInvites: row.allowGroupInvites,
    updatedAt: row.updatedAt,
  };
}

function mapFriendship(row: typeof friendship.$inferSelect): FriendshipRecord {
  return {
    id: row.id,
    requesterUserId: row.requesterUserId,
    addresseeUserId: row.addresseeUserId,
    pairKey: row.pairKey,
    status: row.status as FriendshipStatus,
    blockedByUserId: row.blockedByUserId ?? null,
    note: row.note ?? null,
    requestedAt: row.requestedAt,
    respondedAt: row.respondedAt ?? null,
  };
}

function mapRun(row: typeof contactSyncRun.$inferSelect): ContactSyncRunRecord {
  return {
    id: row.id,
    userId: row.userId,
    ranAt: row.ranAt,
    submittedCount: row.submittedCount,
    matchedCount: row.matchedCount,
    source: row.source as "manual" | "device",
  };
}

export class PostgresSocialStore implements SocialStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresSocialStore {
    const { db } = createDatabase(connectionString);
    return new PostgresSocialStore(db);
  }

  async getOrCreateDirectorySettings(userId: string): Promise<DirectorySettingRecord> {
    const existing = await this.db
      .select()
      .from(userDirectorySetting)
      .where(eq(userDirectorySetting.userId, userId))
      .limit(1);
    if (existing[0]) return mapSettings(existing[0]);
    const inserted = await this.db
      .insert(userDirectorySetting)
      .values({ userId })
      .returning();
    return mapSettings(inserted[0]!);
  }

  async updateDirectorySettings(
    userId: string,
    patch: UpdateDirectoryPrivacyRequest,
  ): Promise<DirectorySettingRecord> {
    await this.getOrCreateDirectorySettings(userId);
    const updates: Partial<typeof userDirectorySetting.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (patch.findableByUsername !== undefined) {
      updates.findableByUsername = patch.findableByUsername;
    }
    if (patch.findableByPhone !== undefined) updates.findableByPhone = patch.findableByPhone;
    if (patch.allowFriendRequests !== undefined) {
      updates.allowFriendRequests = patch.allowFriendRequests;
    }
    if (patch.allowGroupInvites !== undefined) {
      updates.allowGroupInvites = patch.allowGroupInvites;
    }
    const updated = await this.db
      .update(userDirectorySetting)
      .set(updates)
      .where(eq(userDirectorySetting.userId, userId))
      .returning();
    return mapSettings(updated[0]!);
  }

  async findFriendshipByPair(pairKey: string): Promise<FriendshipRecord | null> {
    const rows = await this.db
      .select()
      .from(friendship)
      .where(eq(friendship.pairKey, pairKey))
      .limit(1);
    return rows[0] ? mapFriendship(rows[0]) : null;
  }

  async findFriendshipById(id: string): Promise<FriendshipRecord | null> {
    const rows = await this.db.select().from(friendship).where(eq(friendship.id, id)).limit(1);
    return rows[0] ? mapFriendship(rows[0]) : null;
  }

  async listFriendshipsForUser(
    userId: string,
    status?: FriendshipStatus,
  ): Promise<FriendshipRecord[]> {
    const cond = or(
      eq(friendship.requesterUserId, userId),
      eq(friendship.addresseeUserId, userId),
    );
    const rows = status
      ? await this.db
          .select()
          .from(friendship)
          .where(and(cond, eq(friendship.status, status)))
          .orderBy(desc(friendship.requestedAt))
      : await this.db
          .select()
          .from(friendship)
          .where(cond)
          .orderBy(desc(friendship.requestedAt));
    return rows.map(mapFriendship);
  }

  async createFriendship(input: {
    requesterUserId: string;
    addresseeUserId: string;
    note?: string | null;
  }): Promise<FriendshipRecord> {
    const pairKey = friendshipPairKey(input.requesterUserId, input.addresseeUserId);
    try {
      const inserted = await this.db
        .insert(friendship)
        .values({
          requesterUserId: input.requesterUserId,
          addresseeUserId: input.addresseeUserId,
          pairKey,
          status: "pending",
          note: input.note?.trim() || null,
        })
        .returning();
      return mapFriendship(inserted[0]!);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(msg)) throw new Error("FRIENDSHIP_EXISTS");
      throw error;
    }
  }

  async updateFriendshipStatus(
    id: string,
    patch: {
      status: FriendshipStatus;
      blockedByUserId?: string | null;
      respondedAt?: Date | null;
    },
  ): Promise<FriendshipRecord> {
    const updated = await this.db
      .update(friendship)
      .set({
        status: patch.status,
        blockedByUserId: patch.blockedByUserId,
        respondedAt:
          patch.respondedAt !== undefined
            ? patch.respondedAt
            : patch.status === "pending"
              ? null
              : new Date(),
      })
      .where(eq(friendship.id, id))
      .returning();
    if (!updated[0]) throw new Error("FRIENDSHIP_NOT_FOUND");
    return mapFriendship(updated[0]);
  }

  async deleteFriendship(id: string): Promise<void> {
    await this.db.delete(friendship).where(eq(friendship.id, id));
  }

  async createContactSyncRun(input: {
    userId: string;
    submittedCount: number;
    matchedCount: number;
    source: "manual" | "device";
  }): Promise<ContactSyncRunRecord> {
    const inserted = await this.db
      .insert(contactSyncRun)
      .values({
        userId: input.userId,
        submittedCount: input.submittedCount,
        matchedCount: input.matchedCount,
        source: input.source,
      })
      .returning();
    return mapRun(inserted[0]!);
  }

  async listContactSyncRuns(userId: string, limit = 20): Promise<ContactSyncRunRecord[]> {
    const rows = await this.db
      .select()
      .from(contactSyncRun)
      .where(eq(contactSyncRun.userId, userId))
      .orderBy(desc(contactSyncRun.ranAt))
      .limit(limit);
    return rows.map(mapRun);
  }
}
