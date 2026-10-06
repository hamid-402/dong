/**
 * Local pin / recent prefs for workspace directory switcher.
 * Server sync via /me/ui-prefs (phase 6) — local remains offline fallback.
 */

const PIN_KEY = "dang-pinned-workspaces";
const RECENT_KEY = "dang-recent-workspaces";
const MIGRATE_KEY = "dang-pinned-workspaces-server-merged";
export const MAX_PINNED_WORKSPACES = 8;
const MAX_RECENT = 5;

export type PinnedWorkspace = {
  workspaceId: string;
  pinnedAt: string;
};

export type RecentWorkspace = {
  workspaceId: string;
  visitedAt: string;
  visitCount: number;
};

function readJsonArray<T>(key: string, guard: (row: unknown) => row is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(guard);
  } catch {
    return [];
  }
}

function writeJson(key: string, rows: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* ignore quota */
  }
}

function isPinned(row: unknown): row is PinnedWorkspace {
  if (!row || typeof row !== "object") return false;
  const item = row as Partial<PinnedWorkspace>;
  return typeof item.workspaceId === "string" && typeof item.pinnedAt === "string";
}

function isRecent(row: unknown): row is RecentWorkspace {
  if (!row || typeof row !== "object") return false;
  const item = row as Partial<RecentWorkspace>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.visitedAt === "string" &&
    typeof item.visitCount === "number" &&
    item.visitCount > 0
  );
}

export function listPinnedWorkspaces(limit = MAX_PINNED_WORKSPACES): PinnedWorkspace[] {
  return readJsonArray(PIN_KEY, isPinned).slice(0, limit);
}

export function isWorkspacePinned(workspaceId: string): boolean {
  return listPinnedWorkspaces().some((row) => row.workspaceId === workspaceId);
}

export function togglePinnedWorkspace(workspaceId: string): PinnedWorkspace[] {
  const current = readJsonArray(PIN_KEY, isPinned);
  const exists = current.some((row) => row.workspaceId === workspaceId);
  const next = exists
    ? current.filter((row) => row.workspaceId !== workspaceId)
    : [
        { workspaceId, pinnedAt: new Date().toISOString() },
        ...current.filter((row) => row.workspaceId !== workspaceId),
      ].slice(0, MAX_PINNED_WORKSPACES);
  writeJson(PIN_KEY, next);
  return next;
}

/** Replace local pin list from an ordered id set (server sync). */
export function replacePinnedWorkspaces(
  workspaceIds: readonly string[],
  pinnedAtFallback = new Date().toISOString(),
): PinnedWorkspace[] {
  const existing = new Map(
    readJsonArray(PIN_KEY, isPinned).map((row) => [row.workspaceId, row] as const),
  );
  const next: PinnedWorkspace[] = [];
  for (const workspaceId of workspaceIds) {
    if (!workspaceId) continue;
    next.push({
      workspaceId,
      pinnedAt: existing.get(workspaceId)?.pinnedAt ?? pinnedAtFallback,
    });
    if (next.length >= MAX_PINNED_WORKSPACES) break;
  }
  writeJson(PIN_KEY, next);
  return next;
}

/** Keep pins that still exist in the live membership set. */
export function filterLivePinnedWorkspaces(
  pins: PinnedWorkspace[],
  liveIds: Iterable<string>,
): PinnedWorkspace[] {
  const allowed = new Set(liveIds);
  return pins.filter((pin) => allowed.has(pin.workspaceId));
}

export function listRecentWorkspaces(limit = MAX_RECENT): RecentWorkspace[] {
  return readJsonArray(RECENT_KEY, isRecent)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
    )
    .slice(0, limit);
}

export function rememberWorkspaceVisit(workspaceId: string): RecentWorkspace[] {
  const now = new Date().toISOString();
  const current = readJsonArray(RECENT_KEY, isRecent);
  const existing = current.find((row) => row.workspaceId === workspaceId);
  const next: RecentWorkspace[] = [
    {
      workspaceId,
      visitedAt: now,
      visitCount: (existing?.visitCount ?? 0) + 1,
    },
    ...current.filter((row) => row.workspaceId !== workspaceId),
  ].slice(0, MAX_RECENT + 4);
  writeJson(RECENT_KEY, next);
  return listRecentWorkspaces();
}

export function filterLiveRecentWorkspaces(
  rows: RecentWorkspace[],
  liveIds: Iterable<string>,
): RecentWorkspace[] {
  const allowed = new Set(liveIds);
  return rows.filter((row) => allowed.has(row.workspaceId));
}

export function hasCompletedPinnedServerMerge(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MIGRATE_KEY) === "1";
}

export function markPinnedServerMergeDone(): void {
  try {
    localStorage.setItem(MIGRATE_KEY, "1");
  } catch {
    /* ignore */
  }
}
