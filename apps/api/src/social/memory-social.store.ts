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

function defaultSettings(userId: string): DirectorySettingRecord {
  return {
    userId,
    findableByUsername: true,
    findableByPhone: true,
    findableByEmail: false,
    allowFriendRequests: true,
    allowGroupInvites: true,
    updatedAt: new Date(),
  };
}

export class MemorySocialStore implements SocialStore {
  readonly persistence = "memory" as const;
  private readonly settings = new Map<string, DirectorySettingRecord>();
  private readonly friendships = new Map<string, FriendshipRecord>();
  private readonly byPair = new Map<string, string>();
  private readonly runs: ContactSyncRunRecord[] = [];

  getOrCreateDirectorySettings(userId: string): Promise<DirectorySettingRecord> {
    let row = this.settings.get(userId);
    if (!row) {
      row = defaultSettings(userId);
      this.settings.set(userId, row);
    }
    return Promise.resolve(row);
  }

  async updateDirectorySettings(
    userId: string,
    patch: UpdateDirectoryPrivacyRequest,
  ): Promise<DirectorySettingRecord> {
    const row = await this.getOrCreateDirectorySettings(userId);
    if (patch.findableByUsername !== undefined) {
      row.findableByUsername = patch.findableByUsername;
    }
    if (patch.findableByPhone !== undefined) row.findableByPhone = patch.findableByPhone;
    if (patch.allowFriendRequests !== undefined) {
      row.allowFriendRequests = patch.allowFriendRequests;
    }
    if (patch.allowGroupInvites !== undefined) {
      row.allowGroupInvites = patch.allowGroupInvites;
    }
    row.updatedAt = new Date();
    return row;
  }

  findFriendshipByPair(pairKey: string): Promise<FriendshipRecord | null> {
    const id = this.byPair.get(pairKey);
    return Promise.resolve(id ? (this.friendships.get(id) ?? null) : null);
  }

  findFriendshipById(id: string): Promise<FriendshipRecord | null> {
    return Promise.resolve(this.friendships.get(id) ?? null);
  }

  listFriendshipsForUser(
    userId: string,
    status?: FriendshipStatus,
  ): Promise<FriendshipRecord[]> {
    const rows = [...this.friendships.values()].filter(
      (row) =>
        (row.requesterUserId === userId || row.addresseeUserId === userId) &&
        (status ? row.status === status : true),
    );
    rows.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    return Promise.resolve(rows);
  }

  createFriendship(input: {
    requesterUserId: string;
    addresseeUserId: string;
    note?: string | null;
  }): Promise<FriendshipRecord> {
    const pairKey = friendshipPairKey(input.requesterUserId, input.addresseeUserId);
    if (this.byPair.has(pairKey)) throw new Error("FRIENDSHIP_EXISTS");
    const row: FriendshipRecord = {
      id: crypto.randomUUID(),
      requesterUserId: input.requesterUserId,
      addresseeUserId: input.addresseeUserId,
      pairKey,
      status: "pending",
      blockedByUserId: null,
      note: input.note?.trim() || null,
      requestedAt: new Date(),
      respondedAt: null,
    };
    this.friendships.set(row.id, row);
    this.byPair.set(pairKey, row.id);
    return Promise.resolve(row);
  }

  updateFriendshipStatus(
    id: string,
    patch: {
      status: FriendshipStatus;
      blockedByUserId?: string | null;
      respondedAt?: Date | null;
    },
  ): Promise<FriendshipRecord> {
    const row = this.friendships.get(id);
    if (!row) throw new Error("FRIENDSHIP_NOT_FOUND");
    row.status = patch.status;
    if (patch.blockedByUserId !== undefined) row.blockedByUserId = patch.blockedByUserId;
    if (patch.respondedAt !== undefined) row.respondedAt = patch.respondedAt;
    else if (patch.status !== "pending") row.respondedAt = new Date();
    return Promise.resolve(row);
  }

  deleteFriendship(id: string): Promise<void> {
    const row = this.friendships.get(id);
    if (row) {
      this.friendships.delete(id);
      this.byPair.delete(row.pairKey);
    }
    return Promise.resolve();
  }

  createContactSyncRun(input: {
    userId: string;
    submittedCount: number;
    matchedCount: number;
    source: "manual" | "device";
  }): Promise<ContactSyncRunRecord> {
    const row: ContactSyncRunRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      ranAt: new Date(),
      submittedCount: input.submittedCount,
      matchedCount: input.matchedCount,
      source: input.source,
    };
    this.runs.push(row);
    return Promise.resolve(row);
  }

  listContactSyncRuns(userId: string, limit = 20): Promise<ContactSyncRunRecord[]> {
    return Promise.resolve(
      this.runs
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
        .slice(0, limit),
    );
  }
}
