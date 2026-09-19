import {
  decodeSecurityEventCursor,
  encodeSecurityEventCursor,
  type SecurityEvent,
  type SecurityEventListPage,
  type SecurityEventListQuery,
} from "@dang/contracts";
import type { SecurityEventsStore } from "./security-events.types.js";

const RING_MAX = 500;

/**
 * In-process ring for platform console listing (S11-13 / R10-15).
 * Dual mode also mirrors into Postgres when DATABASE_URL is set.
 */
export class MemorySecurityEventsStore implements SecurityEventsStore {
  readonly persistence = "memory" as const;
  private readonly ring: SecurityEvent[] = [];

  async append(event: SecurityEvent): Promise<SecurityEvent> {
    this.ring.push(event);
    if (this.ring.length > RING_MAX) {
      this.ring.splice(0, this.ring.length - RING_MAX);
    }
    return event;
  }

  async list(query: SecurityEventListQuery = {}): Promise<SecurityEventListPage> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    let items = [...this.ring].reverse();
    if (query.workspaceId) {
      items = items.filter((e) => e.workspaceId === query.workspaceId);
    }
    if (query.category) {
      items = items.filter((e) => e.category === query.category);
    }
    if (query.severity) {
      items = items.filter((e) => e.severity === query.severity);
    }
    const cursor = decodeSecurityEventCursor(query.cursor);
    if (cursor) {
      items = items.filter((e) => {
        if (e.occurredAt < cursor.t) return true;
        if (e.occurredAt > cursor.t) return false;
        return e.id < cursor.id;
      });
    } else if (query.cursor?.trim()) {
      // Legacy zero-based offset cursor from ring-only era.
      const offset = Math.max(Number.parseInt(query.cursor, 10) || 0, 0);
      items = items.slice(offset);
      const page = items.slice(0, limit);
      const nextOffset = offset + page.length;
      return {
        items: page,
        nextCursor:
          nextOffset < offset + items.length ? String(nextOffset) : undefined,
      };
    }
    const page = items.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        page.length === limit && last
          ? encodeSecurityEventCursor(last.occurredAt, last.id)
          : undefined,
    };
  }
}
