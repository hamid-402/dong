/** Social graph + directory lookup (S11-02). */

export type DirectoryUserSummary = {
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
};

export type DirectoryPrivacySettings = {
  findableByUsername: boolean;
  findableByPhone: boolean;
  /** Always false in product default — email directory listing is off. */
  findableByEmail: boolean;
  allowFriendRequests: boolean;
  allowGroupInvites: boolean;
  updatedAt: string;
};

export type UpdateDirectoryPrivacyRequest = {
  findableByUsername?: boolean;
  findableByPhone?: boolean;
  allowFriendRequests?: boolean;
  allowGroupInvites?: boolean;
};

export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

export type FriendshipSummary = {
  id: string;
  otherUser: DirectoryUserSummary;
  status: FriendshipStatus;
  /** True when the current user initiated the row. */
  outgoing: boolean;
  note?: string;
  requestedAt: string;
  respondedAt?: string;
};

/** Users the current actor has blocked (S11-12). */
export type BlockedUserSummary = {
  userId: string;
  displayName: string;
  username?: string;
  blockedAt: string;
};

export type CreateFriendRequestBody = {
  targetUserId: string;
  note?: string;
};

export type ContactMatchRequest = {
  /** Client-normalized phones; server re-normalizes and hashes — raw never persisted. */
  phones: string[];
};

export type ContactMatchResponse = {
  matched: DirectoryUserSummary[];
  submittedCount: number;
  matchedCount: number;
  runId: string;
};

export type ContactSyncRunSummary = {
  id: string;
  ranAt: string;
  submittedCount: number;
  matchedCount: number;
  source: "manual" | "device";
};

/** Account social graph counts (not workspace product-metrics funnel). */
export type SocialCountsSummary = {
  friends: number;
  incomingRequests: number;
  outgoingRequests: number;
  blocked: number;
  persistence: "memory" | "postgres";
};
