import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
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
import { isValidUsername, normalizePhone, normalizeUsername } from "@dang/contracts";
import { ACCOUNT_STORE, type AccountRecord, type AccountStore } from "../auth/account.types.js";
import { hashPhoneE164 } from "../auth/phone-hash.js";
import { createAdaptiveRateLimit } from "../auth/rate-limit.factory.js";
import {
  applyRateLimitHeaders,
  rateLimitProblemFields,
  type RateLimitHeaderReply,
} from "../auth/rate-limit.js";
import {
  SOCIAL_STORE,
  friendshipPairKey,
  toContactSyncSummary,
  toDirectoryPrivacy,
  toFriendshipSummary,
  type SocialStore,
} from "./social.types.js";

const lookupRate = createAdaptiveRateLimit(40, 15 * 60_000);
const friendRequestRate = createAdaptiveRateLimit(30, 15 * 60_000);
const contactMatchRate = createAdaptiveRateLimit(10, 15 * 60_000);
const FRIEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SocialService {
  constructor(
    @Inject(SOCIAL_STORE) private readonly social: SocialStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
  ) {}

  persistence(): "memory" | "postgres" {
    return this.social.persistence;
  }

  private toDirectoryUser(row: AccountRecord): DirectoryUserSummary {
    return {
      userId: row.userId,
      displayName: row.displayName,
      username: row.username ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
    };
  }

  async getPrivacy(actor: AuthActor): Promise<DirectoryPrivacySettings> {
    const row = await this.social.getOrCreateDirectorySettings(actor.userId);
    return toDirectoryPrivacy(row);
  }

  async updatePrivacy(
    actor: AuthActor,
    body: UpdateDirectoryPrivacyRequest,
  ): Promise<DirectoryPrivacySettings> {
    const row = await this.social.updateDirectorySettings(actor.userId, body);
    return toDirectoryPrivacy(row);
  }

  async lookup(
    actor: AuthActor,
    query: { username?: string; phone?: string },
    meta?: { ip?: string; reply?: RateLimitHeaderReply | null },
  ): Promise<DirectoryUserSummary | null> {
    const rate = await lookupRate.consume(`dir:${meta?.ip ?? actor.userId}`);
    applyRateLimitHeaders(meta?.reply, rate);
    if (!rate.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many lookups",
          status: 429,
          detail: "جست‌وجو زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Anti-enumeration: identical empty response whether missing or private.
    const notFound = null;
    if (query.username?.trim()) {
      const username = normalizeUsername(query.username);
      if (!isValidUsername(username)) return notFound;
      const user = await this.accounts.findByUsername(username);
      if (!user || user.userId === actor.userId) return notFound;
      const settings = await this.social.getOrCreateDirectorySettings(user.userId);
      if (!settings.findableByUsername) return notFound;
      return this.toDirectoryUser(user);
    }
    if (query.phone?.trim()) {
      const phone = normalizePhone(query.phone);
      if (!phone) return notFound;
      const user = await this.accounts.findByPhone(phone);
      if (!user || user.userId === actor.userId) return notFound;
      const settings = await this.social.getOrCreateDirectorySettings(user.userId);
      if (!settings.findableByPhone) return notFound;
      return this.toDirectoryUser(user);
    }
    throw new BadRequestException({
      title: "Missing query",
      status: 400,
      detail: "نام کاربری یا شماره موبایل لازم است",
    });
  }

  async listFriends(actor: AuthActor): Promise<FriendshipSummary[]> {
    const rows = await this.social.listFriendshipsForUser(actor.userId, "accepted");
    return this.mapRows(actor.userId, rows);
  }

  async socialCounts(actor: AuthActor): Promise<SocialCountsSummary> {
    const [friends, incoming, outgoing, blocks] = await Promise.all([
      this.listFriends(actor),
      this.listRequests(actor, "incoming"),
      this.listRequests(actor, "outgoing"),
      this.listBlocks(actor),
    ]);
    return {
      friends: friends.length,
      incomingRequests: incoming.length,
      outgoingRequests: outgoing.length,
      blocked: blocks.length,
      persistence: this.persistence(),
    };
  }

  async listBlocks(actor: AuthActor): Promise<BlockedUserSummary[]> {
    const rows = await this.social.listFriendshipsForUser(actor.userId, "blocked");
    const mine = rows.filter((row) => row.blockedByUserId === actor.userId);
    const out: BlockedUserSummary[] = [];
    for (const row of mine) {
      const otherId =
        row.requesterUserId === actor.userId ? row.addresseeUserId : row.requesterUserId;
      const other = await this.accounts.findById(otherId);
      if (!other) continue;
      const blockedAt = (row.respondedAt ?? row.requestedAt).toISOString();
      out.push({
        userId: other.userId,
        displayName: other.displayName,
        username: other.username ?? undefined,
        blockedAt,
      });
    }
    out.sort((a, b) => new Date(b.blockedAt).getTime() - new Date(a.blockedAt).getTime());
    return out;
  }

  async listRequests(
    actor: AuthActor,
    direction: "incoming" | "outgoing",
  ): Promise<FriendshipSummary[]> {
    const rows = await this.social.listFriendshipsForUser(actor.userId, "pending");
    const filtered = rows.filter((row) =>
      direction === "incoming"
        ? row.addresseeUserId === actor.userId
        : row.requesterUserId === actor.userId,
    );
    return this.mapRows(actor.userId, filtered);
  }

  private async mapRows(
    viewerUserId: string,
    rows: Awaited<ReturnType<SocialStore["listFriendshipsForUser"]>>,
  ): Promise<FriendshipSummary[]> {
    const out: FriendshipSummary[] = [];
    for (const row of rows) {
      const otherId =
        row.requesterUserId === viewerUserId ? row.addresseeUserId : row.requesterUserId;
      const other = await this.accounts.findById(otherId);
      if (!other) continue;
      out.push(toFriendshipSummary(row, viewerUserId, this.toDirectoryUser(other)));
    }
    return out;
  }

  async requestFriend(
    actor: AuthActor,
    body: CreateFriendRequestBody,
    meta?: { ip?: string; reply?: RateLimitHeaderReply | null },
  ): Promise<FriendshipSummary> {
    const rate = await friendRequestRate.consume(`fr:${meta?.ip ?? actor.userId}`);
    applyRateLimitHeaders(meta?.reply, rate);
    if (!rate.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many friend requests",
          status: 429,
          detail: "درخواست دوستی زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (body.targetUserId === actor.userId) {
      throw new BadRequestException({
        title: "Invalid target",
        status: 400,
        detail: "نمی‌توانید به خودتان درخواست دوستی بفرستید",
      });
    }
    const target = await this.accounts.findById(body.targetUserId);
    if (!target) {
      throw new NotFoundException({
        title: "User not found",
        status: 404,
        detail: "کاربر یافت نشد",
      });
    }
    const targetSettings = await this.social.getOrCreateDirectorySettings(target.userId);
    if (!targetSettings.allowFriendRequests) {
      throw new ForbiddenException({
        title: "Friend requests disabled",
        status: 403,
        detail: "این کاربر درخواست دوستی قبول نمی‌کند",
        code: "FRIEND_REQUESTS_DISABLED",
      });
    }
    const pairKey = friendshipPairKey(actor.userId, target.userId);
    const existing = await this.social.findFriendshipByPair(pairKey);
    if (existing) {
      if (existing.status === "blocked") {
        throw new ForbiddenException({
          title: "Blocked",
          status: 403,
          detail: "امکان ارسال درخواست وجود ندارد",
          code: "FRIEND_BLOCKED",
        });
      }
      if (existing.status === "accepted" || existing.status === "pending") {
        throw new ConflictException({
          title: "Already connected",
          status: 409,
          detail: "درخواست یا دوستی از قبل وجود دارد",
        });
      }
      if (
        existing.status === "declined" &&
        existing.respondedAt &&
        Date.now() - existing.respondedAt.getTime() < FRIEND_COOLDOWN_MS
      ) {
        throw new BadRequestException({
          title: "Cooldownoldown",
          status: 400,
          detail: "پس از رد شدن باید ۷ روز صبر کنید",
          code: "FRIEND_REQUEST_COOLDOWN",
        });
      }
      await this.social.deleteFriendship(existing.id);
    }
    const row = await this.social.createFriendship({
      requesterUserId: actor.userId,
      addresseeUserId: target.userId,
      note: body.note,
    });
    return toFriendshipSummary(row, actor.userId, this.toDirectoryUser(target));
  }

  async acceptRequest(actor: AuthActor, id: string): Promise<FriendshipSummary> {
    const row = await this.social.findFriendshipById(id);
    if (!row || row.addresseeUserId !== actor.userId || row.status !== "pending") {
      throw new NotFoundException({ title: "Not found", status: 404, detail: "درخواست یافت نشد" });
    }
    const updated = await this.social.updateFriendshipStatus(id, { status: "accepted" });
    const other = await this.accounts.findById(updated.requesterUserId);
    if (!other) throw new NotFoundException({ title: "Not found", status: 404 });
    return toFriendshipSummary(updated, actor.userId, this.toDirectoryUser(other));
  }

  async declineRequest(actor: AuthActor, id: string): Promise<{ ok: true }> {
    const row = await this.social.findFriendshipById(id);
    if (!row || row.addresseeUserId !== actor.userId || row.status !== "pending") {
      throw new NotFoundException({ title: "Not found", status: 404, detail: "درخواست یافت نشد" });
    }
    await this.social.updateFriendshipStatus(id, { status: "declined" });
    return { ok: true };
  }

  /** Requester cancels a pending outgoing request (no cooldown). */
  async cancelOutgoingRequest(actor: AuthActor, id: string): Promise<{ ok: true }> {
    const row = await this.social.findFriendshipById(id);
    if (!row || row.requesterUserId !== actor.userId || row.status !== "pending") {
      throw new NotFoundException({
        title: "Not found",
        status: 404,
        detail: "درخواست خروجی یافت نشد",
      });
    }
    await this.social.deleteFriendship(row.id);
    return { ok: true };
  }

  async removeFriend(actor: AuthActor, otherUserId: string): Promise<{ ok: true }> {
    const pairKey = friendshipPairKey(actor.userId, otherUserId);
    const row = await this.social.findFriendshipByPair(pairKey);
    if (!row || row.status !== "accepted") {
      throw new NotFoundException({ title: "Not found", status: 404, detail: "دوستی یافت نشد" });
    }
    await this.social.deleteFriendship(row.id);
    return { ok: true };
  }

  async block(actor: AuthActor, otherUserId: string): Promise<{ ok: true }> {
    if (otherUserId === actor.userId) {
      throw new BadRequestException({ title: "Invalid", status: 400, detail: "نامعتبر" });
    }
    const pairKey = friendshipPairKey(actor.userId, otherUserId);
    const existing = await this.social.findFriendshipByPair(pairKey);
    if (existing) {
      await this.social.updateFriendshipStatus(existing.id, {
        status: "blocked",
        blockedByUserId: actor.userId,
      });
      return { ok: true };
    }
    const created = await this.social.createFriendship({
      requesterUserId: actor.userId,
      addresseeUserId: otherUserId,
    });
    await this.social.updateFriendshipStatus(created.id, {
      status: "blocked",
      blockedByUserId: actor.userId,
    });
    return { ok: true };
  }

  async unblock(actor: AuthActor, otherUserId: string): Promise<{ ok: true }> {
    const pairKey = friendshipPairKey(actor.userId, otherUserId);
    const row = await this.social.findFriendshipByPair(pairKey);
    if (!row || row.status !== "blocked" || row.blockedByUserId !== actor.userId) {
      throw new NotFoundException({ title: "Not found", status: 404, detail: "بلاک یافت نشد" });
    }
    await this.social.deleteFriendship(row.id);
    return { ok: true };
  }

  async matchContacts(
    actor: AuthActor,
    body: ContactMatchRequest,
    meta?: { ip?: string; reply?: RateLimitHeaderReply | null },
  ): Promise<ContactMatchResponse> {
    const rate = await contactMatchRate.consume(`cm:${meta?.ip ?? actor.userId}`);
    applyRateLimitHeaders(meta?.reply, rate);
    if (!rate.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many contact matches",
          status: 429,
          detail: "تطبیق مخاطبین زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const matched: DirectoryUserSummary[] = [];
    const seen = new Set<string>();
    for (const raw of body.phones) {
      const phone = normalizePhone(raw);
      if (!phone) continue;
      const hash = hashPhoneE164(phone);
      const user = await this.accounts.findByPhoneHash(hash);
      if (!user || user.userId === actor.userId || seen.has(user.userId)) continue;
      const settings = await this.social.getOrCreateDirectorySettings(user.userId);
      if (!settings.findableByPhone) continue;
      seen.add(user.userId);
      matched.push(this.toDirectoryUser(user));
    }
    const run = await this.social.createContactSyncRun({
      userId: actor.userId,
      submittedCount: body.phones.length,
      matchedCount: matched.length,
      source: "manual",
    });
    return {
      matched,
      submittedCount: body.phones.length,
      matchedCount: matched.length,
      runId: run.id,
    };
  }

  async listContactRuns(actor: AuthActor): Promise<ContactSyncRunSummary[]> {
    const rows = await this.social.listContactSyncRuns(actor.userId);
    return rows.map(toContactSyncSummary);
  }
}
