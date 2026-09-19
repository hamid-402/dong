import {
  API_BASE,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
} from "@/lib/api/client";

export type SseConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export type SseHandlers = {
  onEvent: (event: string, data: string) => void;
  onError?: (error: unknown) => void;
  /** Honest single-node reconnect lifecycle (no multi-node claim). */
  onStatus?: (status: SseConnectionStatus) => void;
  /** Attempt number and delay before next reconnect (1-based attempt after first fail). */
  onReconnectInfo?: (info: { attempt: number; delayMs: number }) => void;
};

const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 30_000;

/**
 * Fetch-based SSE (supports session cookies + DevAuth headers).
 * Native EventSource cannot set x-dang-* headers.
 * On stream end/error: exponential backoff reconnect (same API process only).
 */
export function openSseStream(path: string, handlers: SseHandlers): () => void {
  const ac = new AbortController();
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (status: SseConnectionStatus) => {
    handlers.onStatus?.(status);
  };

  const clearReconnect = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** Math.min(attempt, 5),
    );
    attempt += 1;
    setStatus("reconnecting");
    handlers.onReconnectInfo?.({ attempt, delayMs: delay });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void run();
    }, delay);
  };

  const run = async () => {
    if (closed) return;
    setStatus(attempt === 0 ? "connecting" : "reconnecting");
    try {
      const headers = new Headers({
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      });
      if (getAuthClientMode() === "dev") {
        const identity = getDevIdentity();
        headers.set("x-dang-subject", encodeDevHeader(identity.subject));
        headers.set("x-dang-display-name", encodeDevHeader(identity.displayName));
      }
      const response = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers,
        credentials: "include",
        signal: ac.signal,
      });
      if (!response.ok || !response.body) {
        // 503 during API restart / HMR proxy blip — reconnect quietly.
        if (response.status !== 503) {
          handlers.onError?.(new Error(`SSE ${response.status}`));
        }
        scheduleReconnect();
        return;
      }
      attempt = 0;
      setStatus("open");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let dataLines: string[] = [];

      const flush = () => {
        if (dataLines.length === 0) {
          eventName = "message";
          return;
        }
        handlers.onEvent(eventName, dataLines.join("\n"));
        eventName = "message";
        dataLines = [];
      };

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (line === "") {
            flush();
            continue;
          }
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
      }
      if (!closed) scheduleReconnect();
    } catch (error: unknown) {
      if (ac.signal.aborted || closed) return;
      // Incomplete chunked / network drop while proxy remounts — reconnect without noise.
      const msg = error instanceof Error ? error.message : String(error);
      if (!/abort|network|chunked|fetch/i.test(msg)) {
        handlers.onError?.(error);
      }
      scheduleReconnect();
    }
  };

  void run();

  return () => {
    closed = true;
    clearReconnect();
    setStatus("closed");
    ac.abort();
  };
}
