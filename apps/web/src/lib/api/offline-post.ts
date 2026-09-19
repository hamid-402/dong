/**
 * Shared offline enqueue helper for API domain clients (R10-19 deepen).
 */
import { newClientId } from "@/lib/id";
import {
  enqueueOfflineMutation,
  isRetryableOfflineError,
  OfflineQueuedError,
} from "@/lib/offline-mutation-queue";
import { apiFetch } from "@/lib/api/client";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * POST via apiFetch; on retryable offline/503, enqueue and throw OfflineQueuedError.
 */
export async function postWithOfflineQueue<T>(input: {
  path: string;
  body?: string;
  idempotencyKey?: string;
  label: string;
}): Promise<T> {
  const payload = input.body ?? "{}";
  const idem =
    input.idempotencyKey?.trim() ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : newClientId());
  try {
    return await apiFetch<T>(
      input.path,
      { method: "POST", body: payload },
      idem,
    );
  } catch (error: unknown) {
    const storage = browserStorage();
    if (storage && isRetryableOfflineError(error)) {
      const queued = enqueueOfflineMutation(storage, {
        method: "POST",
        path: input.path,
        body: payload,
        idempotencyKey: idem,
        label: input.label,
      });
      throw new OfflineQueuedError(queued.id, queued.label);
    }
    throw error;
  }
}
