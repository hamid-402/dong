import type {
  BlockedUserSummary,
  ContactMatchRequest,
  ContactMatchResponse,
  ContactSyncRunSummary,
  CreateFriendRequestBody,
  DirectoryPrivacySettings,
  DirectoryUserSummary,
  FriendshipSummary,
  SocialCountsSummary,
  UpdateDirectoryPrivacyRequest,
} from "@dang/contracts";
import { apiFetch } from "@/lib/api/client";
import { postWithOfflineQueue } from "./offline-post";

export const socialApi = {
  getDirectoryPrivacy: () =>
    apiFetch<DirectoryPrivacySettings>("/account/privacy/directory"),
  updateDirectoryPrivacy: (body: UpdateDirectoryPrivacyRequest) =>
    apiFetch<DirectoryPrivacySettings>("/account/privacy/directory", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  lookupDirectory: (query: { username?: string; phone?: string }) => {
    const params = new URLSearchParams();
    if (query.username) params.set("username", query.username);
    if (query.phone) params.set("phone", query.phone);
    return apiFetch<DirectoryUserSummary | null>(`/directory/lookup?${params}`);
  },
  listFriends: () => apiFetch<FriendshipSummary[]>("/friends"),
  socialCounts: () => apiFetch<SocialCountsSummary>("/me/social-counts"),
  listBlockedUsers: () => apiFetch<BlockedUserSummary[]>("/friends/blocks"),
  listFriendRequests: (direction: "incoming" | "outgoing") =>
    apiFetch<FriendshipSummary[]>(`/friends/requests?direction=${direction}`),
  sendFriendRequest: (body: CreateFriendRequestBody) =>
    postWithOfflineQueue<FriendshipSummary>({
      path: "/friends/requests",
      body: JSON.stringify(body),
      label: "ارسال درخواست دوستی",
    }),
  acceptFriendRequest: (id: string) =>
    postWithOfflineQueue<FriendshipSummary>({
      path: `/friends/requests/${encodeURIComponent(id)}/accept`,
      label: "پذیرش درخواست دوستی",
    }),
  declineFriendRequest: (id: string) =>
    postWithOfflineQueue<{ ok: true }>({
      path: `/friends/requests/${encodeURIComponent(id)}/decline`,
      label: "رد درخواست دوستی",
    }),
  cancelFriendRequest: (id: string) =>
    postWithOfflineQueue<{ ok: true }>({
      path: `/friends/requests/${encodeURIComponent(id)}/cancel`,
      label: "لغو درخواست دوستی",
    }),
  removeFriend: (userId: string) =>
    apiFetch<{ ok: true }>(`/friends/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  blockUser: (userId: string) =>
    postWithOfflineQueue<{ ok: true }>({
      path: `/friends/${encodeURIComponent(userId)}/block`,
      body: "{}",
      label: "مسدود کردن کاربر",
    }),
  unblockUser: (userId: string) =>
    apiFetch<{ ok: true }>(`/friends/${encodeURIComponent(userId)}/block`, {
      method: "DELETE",
    }),
  matchContacts: (body: ContactMatchRequest) =>
    apiFetch<ContactMatchResponse>("/contacts/match", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listContactRuns: () => apiFetch<ContactSyncRunSummary[]>("/contacts/runs"),
};
