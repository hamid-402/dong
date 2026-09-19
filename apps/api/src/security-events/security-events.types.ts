import type {
  PersistenceKind,
  SecurityEvent,
  SecurityEventName,
  SecurityEventListPage,
  SecurityEventListQuery,
} from "@dang/contracts";

export const SECURITY_EVENTS_STORE = Symbol("SECURITY_EVENTS_STORE");

/**
 * Recording side of the security log, as a token.
 *
 * Access checks and the four-eyes gate need to record denials, but the service
 * that records them also needs the access checks — importing the class there
 * would be a runtime cycle, and a plain type annotation leaves the injected
 * dependency silently undefined. Both inject this token instead.
 */
export const SECURITY_EVENT_RECORDER = Symbol("SECURITY_EVENT_RECORDER");

export type SecurityEventRecorder = {
  emit(
    name: SecurityEventName,
    partial?: Omit<SecurityEvent, "id" | "event" | "category" | "severity" | "occurredAt"> & {
      category?: SecurityEvent["category"];
      severity?: SecurityEvent["severity"];
      id?: string;
    },
  ): SecurityEvent;
  listRecent(input?: SecurityEventListQuery): Promise<SecurityEventListPage>;
};

export type SecurityEventsStore = {
  readonly persistence: PersistenceKind;
  append(event: SecurityEvent): Promise<SecurityEvent>;
  list(query?: SecurityEventListQuery): Promise<SecurityEventListPage>;
};
