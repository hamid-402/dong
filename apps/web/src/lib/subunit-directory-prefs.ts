/**
 * Local pin / recent prefs for building/org subunits (structural rail).
 */

const PIN_KEY = "dang-pinned-subunits";
const RECENT_KEY = "dang-recent-subunits";
const MAX_PINNED = 5;
const MAX_RECENT = 5;

export type PinnedSubunit = {
  workspaceId: string;
  subunitId: string;
  pinnedAt: string;
};

export type RecentSubunit = {
  workspaceId: string;
  subunitId: string;
  visitedAt: string;
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
    /* ignore */
  }
}

function isPinned(row: unknown): row is PinnedSubunit {
  if (!row || typeof row !== "object") return false;
  const item = row as Partial<PinnedSubunit>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.subunitId === "string" &&
    typeof item.pinnedAt === "string"
  );
}

function isRecent(row: unknown): row is RecentSubunit {
  if (!row || typeof row !== "object") return false;
  const item = row as Partial<RecentSubunit>;
  return (
    typeof item.workspaceId === "string" &&
    typeof item.subunitId === "string" &&
    typeof item.visitedAt === "string"
  );
}

export function listPinnedSubunits(
  workspaceId: string,
  limit = MAX_PINNED,
): PinnedSubunit[] {
  return readJsonArray(PIN_KEY, isPinned)
    .filter((row) => row.workspaceId === workspaceId)
    .slice(0, limit);
}

export function togglePinnedSubunit(
  workspaceId: string,
  subunitId: string,
): PinnedSubunit[] {
  const current = readJsonArray(PIN_KEY, isPinned);
  const exists = current.some(
    (row) => row.workspaceId === workspaceId && row.subunitId === subunitId,
  );
  const next = exists
    ? current.filter(
        (row) =>
          !(row.workspaceId === workspaceId && row.subunitId === subunitId),
      )
    : [
        {
          workspaceId,
          subunitId,
          pinnedAt: new Date().toISOString(),
        },
        ...current.filter(
          (row) =>
            !(row.workspaceId === workspaceId && row.subunitId === subunitId),
        ),
      ].slice(0, MAX_PINNED * 4);
  writeJson(PIN_KEY, next);
  return listPinnedSubunits(workspaceId);
}

export function isSubunitPinned(workspaceId: string, subunitId: string): boolean {
  return listPinnedSubunits(workspaceId).some((row) => row.subunitId === subunitId);
}

export function listRecentSubunits(
  workspaceId: string,
  limit = MAX_RECENT,
): RecentSubunit[] {
  return readJsonArray(RECENT_KEY, isRecent)
    .filter((row) => row.workspaceId === workspaceId)
    .sort(
      (a, b) =>
        new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
    )
    .slice(0, limit);
}

export function rememberSubunitVisit(
  workspaceId: string,
  subunitId: string,
): RecentSubunit[] {
  const now = new Date().toISOString();
  const current = readJsonArray(RECENT_KEY, isRecent);
  const next = [
    { workspaceId, subunitId, visitedAt: now },
    ...current.filter(
      (row) =>
        !(row.workspaceId === workspaceId && row.subunitId === subunitId),
    ),
  ].slice(0, MAX_RECENT * 4);
  writeJson(RECENT_KEY, next);
  return listRecentSubunits(workspaceId);
}
