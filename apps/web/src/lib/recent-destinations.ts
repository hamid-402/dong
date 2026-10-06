const STORAGE_KEY = "dang-recent-destinations";
const MAX_RECENT = 12;
const DEFAULT_WINDOW_MS = 30 * 24 * 3600_000;

export type RecentDestination = {
  key: string;
  label: string;
  href: string;
  visitedAt: string;
  /** Visits inside the retention window (honest local usage, not invented). */
  visitCount: number;
};

function readAll(): RecentDestination[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): RecentDestination | null => {
        if (!row || typeof row !== "object") return null;
        const item = row as Partial<RecentDestination>;
        if (
          typeof item.key !== "string" ||
          typeof item.label !== "string" ||
          typeof item.href !== "string" ||
          typeof item.visitedAt !== "string"
        ) {
          return null;
        }
        const visitCount =
          typeof item.visitCount === "number" && item.visitCount > 0
            ? Math.floor(item.visitCount)
            : 1;
        return {
          key: item.key,
          label: item.label,
          href: item.href,
          visitedAt: item.visitedAt,
          visitCount,
        };
      })
      .filter((row): row is RecentDestination => row !== null);
  } catch {
    return [];
  }
}

function writeAll(rows: RecentDestination[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

export function listRecentDestinations(limit = 6): RecentDestination[] {
  return readAll()
    .slice()
    .sort(
      (a, b) =>
        new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
    )
    .slice(0, limit);
}

/**
 * Top destinations by visit frequency in the last `windowMs` (default 30 days).
 * Only returns rows that still appear in `liveHrefs` when that set is provided.
 */
export function topUsedDestinations(
  limit = 3,
  options?: {
    windowMs?: number;
    liveHrefs?: Iterable<string>;
    now?: number;
  },
): RecentDestination[] {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options?.now ?? Date.now();
  const allowed = options?.liveHrefs ? new Set(options.liveHrefs) : null;
  return readAll()
    .filter((row) => {
      if (allowed && !allowed.has(row.href)) return false;
      const at = new Date(row.visitedAt).getTime();
      return Number.isFinite(at) && now - at <= windowMs;
    })
    .slice()
    .sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return (
        new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime()
      );
    })
    .slice(0, limit);
}

/** Record a real navigation target — used by mosaic tiles (not decorative). */
export function rememberDestination(input: {
  key: string;
  label: string;
  href: string;
}): RecentDestination[] {
  if (typeof window === "undefined") return [];
  const existing = readAll();
  const prior = existing.find(
    (row) => row.href === input.href || row.key === input.key,
  );
  const next: RecentDestination = {
    key: input.key,
    label: input.label,
    href: input.href,
    visitedAt: new Date().toISOString(),
    visitCount: (prior?.visitCount ?? 0) + 1,
  };
  const rest = existing.filter(
    (row) => row.href !== next.href && row.key !== next.key,
  );
  const merged = [next, ...rest].slice(0, MAX_RECENT);
  writeAll(merged);
  return merged;
}
