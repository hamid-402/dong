"use client";

import { useEffect, useRef } from "react";

/**
 * Server-pushed "this data is stale now" signal.
 *
 * The API sends a `data.invalidate` SSE event with topics (balances, statements,
 * invoices:{periodId}, expenses, periods). The app chrome owns the single SSE
 * connection and republishes the topics on this bus, so any page can refetch
 * exactly when something changed instead of polling on a timer.
 */
const EVENT_NAME = "dang:data-invalidate";

export type LiveInvalidationDetail = {
  workspaceId: string;
  topics: string[];
  at: string;
};

export function publishLiveInvalidation(detail: LiveInvalidationDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

/**
 * Runs `onInvalidate` when the server reports one of `topics` changed.
 * Topics match exactly, or by `prefix:` when the topic ends with `:`.
 */
export function useLiveInvalidation(
  topics: readonly string[],
  onInvalidate: (detail: LiveInvalidationDetail) => void,
): void {
  const handler = useRef(onInvalidate);
  useEffect(() => {
    handler.current = onInvalidate;
  }, [onInvalidate]);
  const key = topics.join("|");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wanted = key.split("|").filter(Boolean);
    if (wanted.length === 0) return;

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<LiveInvalidationDetail>).detail;
      if (!detail || !Array.isArray(detail.topics)) return;
      const hit = detail.topics.some((topic) =>
        wanted.some((want) =>
          want.endsWith(":") ? topic.startsWith(want) : topic === want,
        ),
      );
      if (hit) handler.current(detail);
    };

    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, [key]);
}
