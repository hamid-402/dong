import type {
  SecurityEvent,
  SecurityEventListPage,
  SecurityEventListQuery,
} from "@dang/contracts";
import type { SecurityEventsStore } from "./security-events.types.js";
import type { MemorySecurityEventsStore } from "./memory-security-events.store.js";
import type { PostgresSecurityEventsStore } from "./postgres-security-events.store.js";

/**
 * Writes to memory ring + Postgres; lists from Postgres (durable) with
 * memory as in-process mirror for the same process.
 */
export class DualSecurityEventsStore implements SecurityEventsStore {
  readonly persistence = "postgres" as const;

  constructor(
    private readonly postgres: PostgresSecurityEventsStore,
    private readonly memory: MemorySecurityEventsStore,
  ) {}

  async append(event: SecurityEvent): Promise<SecurityEvent> {
    await this.memory.append(event);
    return this.postgres.append(event);
  }

  async list(query?: SecurityEventListQuery): Promise<SecurityEventListPage> {
    return this.postgres.list(query);
  }
}
