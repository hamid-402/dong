import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { NotificationSummary } from "@dang/contracts";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type Redis from "ioredis";
import {
  createDedicatedRedisClient,
  getRedisClient,
} from "../jobs/redis-queue.js";

export type RealtimeEnvelope =
  | { type: "notification"; notification: NotificationSummary }
  | { type: "notification.read"; notification: NotificationSummary }
  | {
      type: "presence.snapshot";
      workspaceId: string;
      userIds: string[];
    }
  | {
      type: "presence.join" | "presence.leave";
      workspaceId: string;
      userId: string;
    }
  /**
   * "your cached finance data is stale" — carries topics instead of data so
   * the client refetches through the normal authorized endpoints.
   */
  | {
      type: "data.invalidate";
      workspaceId: string;
      topics: string[];
      at: string;
    }
  | { type: "heartbeat"; at: string };

type Listener = (envelope: RealtimeEnvelope) => void;

type WireMessage = {
  origin: string;
  route: "user" | "presence";
  workspaceId: string;
  userId?: string;
  envelope: RealtimeEnvelope;
};

const PUBSUB_CHANNEL = "dang:realtime:v1";
const PRESENCE_TTL_SEC = 86_400;

function presenceHashKey(workspaceId: string): string {
  return `dang:realtime:presence:${workspaceId}`;
}

/**
 * In-process SSE fan-out (R10-18), with optional Redis pub/sub when REDIS_URL is live.
 * Honest: without Redis → sse_local; with subscriber ready → sse_redis.
 */
@Injectable()
export class RealtimeHub implements OnModuleInit, OnModuleDestroy {
  private readonly bus = new EventEmitter();
  /** workspaceId → userId → connection count (this process only) */
  private readonly presence = new Map<string, Map<string, number>>();
  private readonly instanceId = randomUUID();
  private subscriber: Redis | null = null;
  private fanOutReady = false;

  constructor() {
    this.bus.setMaxListeners(200);
  }

  async onModuleInit(): Promise<void> {
    await this.tryStartFanOut();
  }

  async onModuleDestroy(): Promise<void> {
    this.fanOutReady = false;
    const sub = this.subscriber;
    this.subscriber = null;
    if (!sub) return;
    try {
      await sub.unsubscribe(PUBSUB_CHANNEL);
    } catch {
      /* ignore */
    }
    try {
      sub.disconnect();
    } catch {
      /* ignore */
    }
  }

  /** Capabilities signal — only sse_redis after Redis subscribe succeeds. */
  providerMode(): "sse_local" | "sse_redis" {
    return this.fanOutReady ? "sse_redis" : "sse_local";
  }

  channelKey(workspaceId: string, userId: string): string {
    return `${workspaceId}::${userId}`;
  }

  subscribe(workspaceId: string, userId: string, listener: Listener): () => void {
    const key = this.channelKey(workspaceId, userId);
    this.bus.on(key, listener);
    this.bumpPresence(workspaceId, userId, +1);
    const join: RealtimeEnvelope = {
      type: "presence.join",
      workspaceId,
      userId,
    };
    this.bus.emit(this.presenceKey(workspaceId), join);
    this.broadcastWire({
      origin: this.instanceId,
      route: "presence",
      workspaceId,
      userId,
      envelope: join,
    });
    return () => {
      this.bus.off(key, listener);
      this.bumpPresence(workspaceId, userId, -1);
      const leave: RealtimeEnvelope = {
        type: "presence.leave",
        workspaceId,
        userId,
      };
      this.bus.emit(this.presenceKey(workspaceId), leave);
      this.broadcastWire({
        origin: this.instanceId,
        route: "presence",
        workspaceId,
        userId,
        envelope: leave,
      });
    };
  }

  /** Subscribe to presence events for a workspace (all members' streams). */
  subscribePresence(workspaceId: string, listener: Listener): () => void {
    const key = this.presenceKey(workspaceId);
    this.bus.on(key, listener);
    return () => this.bus.off(key, listener);
  }

  publishToUser(
    workspaceId: string,
    userId: string,
    envelope: RealtimeEnvelope,
  ): void {
    this.bus.emit(this.channelKey(workspaceId, userId), envelope);
    this.broadcastWire({
      origin: this.instanceId,
      route: "user",
      workspaceId,
      userId,
      envelope,
    });
  }

  /** Fan out one envelope to a known set of members of a workspace. */
  publishToMembers(
    workspaceId: string,
    userIds: readonly string[],
    envelope: RealtimeEnvelope,
  ): void {
    for (const userId of new Set(userIds)) {
      this.publishToUser(workspaceId, userId, envelope);
    }
  }

  /** Tells the given members that these finance topics changed just now. */
  publishInvalidate(
    workspaceId: string,
    userIds: readonly string[],
    topics: readonly string[],
  ): void {
    this.publishToMembers(workspaceId, userIds, {
      type: "data.invalidate",
      workspaceId,
      topics: [...topics],
      at: new Date().toISOString(),
    });
  }

  publishNotification(notification: NotificationSummary): void {
    this.publishToUser(notification.workspaceId, notification.userId, {
      type: "notification",
      notification,
    });
  }

  publishNotificationRead(notification: NotificationSummary): void {
    this.publishToUser(notification.workspaceId, notification.userId, {
      type: "notification.read",
      notification,
    });
  }

  async listPresentUserIds(workspaceId: string): Promise<string[]> {
    if (this.fanOutReady) {
      const redis = await getRedisClient();
      if (redis) {
        try {
          const hash = await redis.hgetall(presenceHashKey(workspaceId));
          return Object.entries(hash)
            .filter(([, raw]) => Number(raw) > 0)
            .map(([id]) => id)
            .sort();
        } catch {
          /* fall through to local */
        }
      }
    }
    const map = this.presence.get(workspaceId);
    if (!map) return [];
    return [...map.entries()].filter(([, n]) => n > 0).map(([id]) => id);
  }

  private presenceKey(workspaceId: string): string {
    return `presence::${workspaceId}`;
  }

  private bumpPresence(workspaceId: string, userId: string, delta: number): void {
    let map = this.presence.get(workspaceId);
    if (!map) {
      map = new Map();
      this.presence.set(workspaceId, map);
    }
    const next = (map.get(userId) ?? 0) + delta;
    if (next <= 0) map.delete(userId);
    else map.set(userId, next);
    if (map.size === 0) this.presence.delete(workspaceId);
    void this.syncPresenceRedis(workspaceId, userId, delta);
  }

  private async syncPresenceRedis(
    workspaceId: string,
    userId: string,
    delta: number,
  ): Promise<void> {
    if (!this.fanOutReady) return;
    const redis = await getRedisClient();
    if (!redis) return;
    const key = presenceHashKey(workspaceId);
    try {
      const n = await redis.hincrby(key, userId, delta);
      if (n <= 0) await redis.hdel(key, userId);
      await redis.expire(key, PRESENCE_TTL_SEC);
    } catch {
      /* local map remains source for this process */
    }
  }

  private broadcastWire(msg: WireMessage): void {
    if (!this.fanOutReady) return;
    void (async () => {
      const redis = await getRedisClient();
      if (!redis) return;
      try {
        await redis.publish(PUBSUB_CHANNEL, JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    })();
  }

  private applyRemote(msg: WireMessage): void {
    if (msg.origin === this.instanceId) return;
    if (msg.route === "user" && msg.userId) {
      this.bus.emit(this.channelKey(msg.workspaceId, msg.userId), msg.envelope);
      return;
    }
    if (msg.route === "presence") {
      this.bus.emit(this.presenceKey(msg.workspaceId), msg.envelope);
    }
  }

  private async tryStartFanOut(): Promise<void> {
    const sub = await createDedicatedRedisClient();
    if (!sub) {
      this.fanOutReady = false;
      return;
    }
    try {
      await sub.subscribe(PUBSUB_CHANNEL);
      sub.on("message", (channel, raw) => {
        if (channel !== PUBSUB_CHANNEL) return;
        try {
          const parsed = JSON.parse(raw) as WireMessage;
          if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof parsed.origin !== "string" ||
            (parsed.route !== "user" && parsed.route !== "presence") ||
            typeof parsed.workspaceId !== "string" ||
            !parsed.envelope
          ) {
            return;
          }
          this.applyRemote(parsed);
        } catch {
          /* ignore malformed */
        }
      });
      this.subscriber = sub;
      this.fanOutReady = true;
    } catch {
      this.fanOutReady = false;
      try {
        sub.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
