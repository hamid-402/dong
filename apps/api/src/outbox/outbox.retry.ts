/**
 * Law 10 — outbox retry / dead-letter policy.
 * Documented on OutboxRelay as MAX_ATTEMPTS / BASE_BACKOFF_MS.
 */
export const OUTBOX_MAX_ATTEMPTS = 5;
/** Base delay for exponential backoff: BASE * 2^(attempts-1) after each failure. */
export const OUTBOX_BASE_BACKOFF_MS = 1000;

export type OutboxRetryUpdate = {
  attempts: number;
  lastError: string;
  nextAttemptAt?: string;
  deadLetteredAt?: string;
};

/** After a failure, compute attempts + schedule or dead-letter. */
export function computeOutboxRetryUpdate(
  previousAttempts: number,
  error: string,
  now = new Date(),
): OutboxRetryUpdate {
  const attempts = previousAttempts + 1;
  const lastError = error.slice(0, 2000);
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    return {
      attempts,
      lastError,
      deadLetteredAt: now.toISOString(),
      nextAttemptAt: undefined,
    };
  }
  const delayMs = OUTBOX_BASE_BACKOFF_MS * 2 ** (attempts - 1);
  return {
    attempts,
    lastError,
    nextAttemptAt: new Date(now.getTime() + delayMs).toISOString(),
    deadLetteredAt: undefined,
  };
}

export function isOutboxDue(
  row: {
    processedAt?: string;
    deadLetteredAt?: string;
    nextAttemptAt?: string;
  },
  now = Date.now(),
): boolean {
  if (row.processedAt) return false;
  if (row.deadLetteredAt) return false;
  if (!row.nextAttemptAt) return true;
  const due = Date.parse(row.nextAttemptAt);
  return Number.isFinite(due) && due <= now;
}
