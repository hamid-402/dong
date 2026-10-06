/**
 * Sync directory workspace pins with GET/PUT /me/ui-prefs.
 * Local storage remains the offline source of truth; server is best-effort.
 */

import { mergePinnedWorkspaceIds } from "@dang/contracts";
import { api } from "@/lib/api";
import {
  filterLivePinnedWorkspaces,
  hasCompletedPinnedServerMerge,
  listPinnedWorkspaces,
  markPinnedServerMergeDone,
  replacePinnedWorkspaces,
  togglePinnedWorkspace,
} from "@/lib/workspace-directory-prefs";

let syncInFlight: Promise<string[]> | null = null;

/**
 * Pull server pins, union with local (no drop), write local, and push if needed.
 * Safe to call repeatedly — first successful merge marks migrate done.
 */
export async function syncPinnedWorkspacesFromServer(
  liveWorkspaceIds: Iterable<string>,
): Promise<string[]> {
  if (typeof window === "undefined") return [];
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const live = [...liveWorkspaceIds];
    const localIds = filterLivePinnedWorkspaces(
      listPinnedWorkspaces(),
      live,
    ).map((row) => row.workspaceId);

    let serverIds: string[] = [];
    try {
      const prefs = await api.getUiPrefs();
      serverIds = filterLivePinnedWorkspaces(
        (prefs.pinnedWorkspaceIds ?? []).map((workspaceId) => ({
          workspaceId,
          pinnedAt: prefs.updatedAt ?? new Date().toISOString(),
        })),
        live,
      ).map((row) => row.workspaceId);
    } catch {
      return localIds;
    }

    const merged = mergePinnedWorkspaceIds(localIds, serverIds);
    replacePinnedWorkspaces(merged);

    const needsPush =
      !hasCompletedPinnedServerMerge() ||
      merged.length !== serverIds.length ||
      merged.some((id, i) => id !== serverIds[i]);

    if (needsPush) {
      try {
        await api.putUiPrefs({ pinnedWorkspaceIds: merged });
        markPinnedServerMergeDone();
      } catch {
        /* keep local; retry next session */
      }
    } else {
      markPinnedServerMergeDone();
    }

    return merged;
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

/** Toggle local pin then best-effort PUT to server. */
export async function togglePinnedWorkspaceSynced(
  workspaceId: string,
  liveWorkspaceIds: Iterable<string>,
): Promise<string[]> {
  const nextLocal = togglePinnedWorkspace(workspaceId);
  const liveIds = filterLivePinnedWorkspaces(
    nextLocal,
    liveWorkspaceIds,
  ).map((row) => row.workspaceId);
  try {
    await api.putUiPrefs({ pinnedWorkspaceIds: liveIds });
    markPinnedServerMergeDone();
  } catch {
    /* local already updated */
  }
  return liveIds;
}
