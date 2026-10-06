"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceDirectoryEntry, WorkspaceDirectoryResponse } from "@dang/contracts";
import { api } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

export type WorkspaceDirectoryState = {
  entries: WorkspaceDirectoryEntry[];
  metricsIncluded: boolean;
  metricsOmittedReason?: WorkspaceDirectoryResponse["metricsOmittedReason"];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: (opts?: { metrics?: boolean }) => Promise<void>;
};

/**
 * Live workspace directory for switcher / finder enrichment.
 * Metrics are opt-in — never invent nets when omitted.
 */
export function useWorkspaceDirectory(options?: {
  /** When true, request bounded metrics once chrome is ready. */
  metrics?: boolean;
  enabled?: boolean;
}): WorkspaceDirectoryState {
  const chrome = useAppChrome();
  const enabled = options?.enabled !== false;
  const wantMetrics = Boolean(options?.metrics);
  const [entries, setEntries] = useState<WorkspaceDirectoryEntry[]>([]);
  const [metricsIncluded, setMetricsIncluded] = useState(false);
  const [metricsOmittedReason, setMetricsOmittedReason] =
    useState<WorkspaceDirectoryResponse["metricsOmittedReason"]>();
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { metrics?: boolean }) => {
      if (!enabled || !chrome.ready) return;
      setLoading(true);
      try {
        const res = await api.listWorkspaceDirectory({
          metrics: opts?.metrics ?? wantMetrics,
        });
        setEntries(res.entries);
        setMetricsIncluded(Boolean(res.metricsIncluded));
        setMetricsOmittedReason(res.metricsOmittedReason);
        setGeneratedAt(res.generatedAt);
        setError(null);
      } catch {
        setError("بارگذاری فهرست فضاها ناموفق بود");
      } finally {
        setLoading(false);
      }
    },
    [enabled, chrome.ready, wantMetrics],
  );

  useEffect(() => {
    if (!enabled || !chrome.ready) return;
    void refresh();
  }, [enabled, chrome.ready, chrome.workspaces.length, refresh]);

  return {
    entries,
    metricsIncluded,
    metricsOmittedReason,
    generatedAt,
    loading,
    error,
    refresh,
  };
}

/** Merge directory metrics onto a chrome workspace row without inventing values. */
export function directoryMetricsFor(
  entries: WorkspaceDirectoryEntry[],
  workspaceId: string,
): Pick<WorkspaceDirectoryEntry, "myNetMinor" | "openSettlements" | "myRole"> | null {
  const hit = entries.find((row) => row.id === workspaceId);
  if (!hit) return null;
  return {
    myRole: hit.myRole,
    myNetMinor: hit.myNetMinor,
    openSettlements: hit.openSettlements,
  };
}
