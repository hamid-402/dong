import type {
  ContactSyncRunSummary,
  DirectoryPrivacySettings,
  DirectoryUserSummary,
  FriendshipStatus,
  FriendshipSummary,
  UpdateDirectoryPrivacyRequest,
} from "@dang/contracts";

export type FriendshipRecord = {
  id: string;
  requesterUserId: string;
  addresseeUserId: string;
  pairKey: string;
  status: FriendshipStatus;
  blockedByUserId: string | null;
  note: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
};

export type DirectorySettingRecord = {
  userId: string;
  findableByUsername: boolean;
  findableByPhone: boolean;
  findableByEmail: boolean;
  allowFriendRequests: boolean;
  allowGroupInvites: boolean;
  updatedAt: Date;
};

export type ContactSyncRunRecord = {
  id: string;
  userId: string;
  ranAt: Date;
  submittedCount: number;
  matchedCount: number;
  source: "manual" | "device";
};

export function friendshipPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export type SocialStore = {
  readonly persistence: "memory" | "postgres";
  getOrCreateDirectorySettings(userId: string): Promise<DirectorySettingRecord>;
  updateDirectorySettings(
    userId: string,
    patch: UpdateDirectoryPrivacyRequest,
  ): Promise<DirectorySettingRecord>;
  findFriendshipByPair(pairKey: string): Promise<FriendshipRecord | null>;
  findFriendshipById(id: string): Promise<FriendshipRecord | null>;
  listFriendshipsForUser(
    userId: string,
    status?: FriendshipStatus,
  ): Promise<FriendshipRecord[]>;
  createFriendship(input: {
    requesterUserId: string;
    addresseeUserId: string;
    note?: string | null;
  }): Promise<FriendshipRecord>;
  updateFriendshipStatus(
    id: string,
    patch: {
      status: FriendshipStatus;
      blockedByUserId?: string | null;
      respondedAt?: Date | null;
    },
  ): Promise<FriendshipRecord>;
  deleteFriendship(id: string): Promise<void>;
  createContactSyncRun(input: {
    userId: string;
    submittedCount: number;
    matchedCount: number;
    source: "manual" | "device";
  }): Promise<ContactSyncRunRecord>;
  listContactSyncRuns(userId: string, limit?: number): Promise<ContactSyncRunRecord[]>;
};

export const SOCIAL_STORE = Symbol("SOCIAL_STORE");

export function toDirectoryPrivacy(row: DirectorySettingRecord): DirectoryPrivacySettings {
  return {
    findableByUsername: row.findableByUsername,
    findableByPhone: row.findableByPhone,
    findableByEmail: row.findableByEmail,
    allowFriendRequests: row.allowFriendRequests,
    allowGroupInvites: row.allowGroupInvites,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toContactSyncSummary(row: ContactSyncRunRecord): ContactSyncRunSummary {
  return {
    id: row.id,
    ranAt: row.ranAt.toISOString(),
    submittedCount: row.submittedCount,
    matchedCount: row.matchedCount,
    source: row.source,
  };
}

export function toFriendshipSummary(
  row: FriendshipRecord,
  viewerUserId: string,
  other: DirectoryUserSummary,
): FriendshipSummary {
  return {
    id: row.id,
    otherUser: other,
    status: row.status,
    outgoing: row.requesterUserId === viewerUserId,
    note: row.note ?? undefined,
    requestedAt: row.requestedAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString(),
  };
}
