/** Workspace membership management (S11-03). */

export type MembershipAddedVia =
  | "invite"
  | "friend"
  | "join_request"
  | "user_id"
  | "seed";

export type JoinRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "expired";

export type JoinRequestSummary = {
  id: string;
  workspaceId: string;
  userId: string;
  displayName: string;
  message?: string;
  status: JoinRequestStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedByUserId?: string;
  /** MembershipRole string when approved. */
  grantedRole?: string;
};

export type CreateJoinRequestBody = {
  message?: string;
};

export type ApproveJoinRequestBody = {
  role: string;
};

export type AddWorkspaceMemberBody = {
  userId: string;
  role: string;
  defaultShares?: number;
};

export type UpdateWorkspaceMemberBody = {
  role?: string;
  defaultShares?: number;
};

export type DisableWorkspaceMemberBody = {
  reason: string;
};

export type OwnershipTransferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type OwnershipTransferSummary = {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  status: OwnershipTransferStatus;
  createdAt: string;
  decidedAt?: string;
  expiresAt: string;
};

export type ProposeOwnershipTransferBody = {
  toUserId: string;
};
