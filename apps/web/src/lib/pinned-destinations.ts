const STORAGE_KEY = "dang-pinned-destinations";
const MAX_PINNED = 6;

export type PinnedDestination = {
  key: string;
  label: string;
  href: string;
  pinnedAt: string;
};

function readAll(): PinnedDestination[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is PinnedDestination => {
      if (!row || typeof row !== "object") return false;
      const item = row as PinnedDestination;
      return (
        typeof item.key === "string" &&
        typeof item.label === "string" &&
        typeof item.href === "string" &&
        typeof item.pinnedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeAll(rows: PinnedDestination[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_PINNED)));
  } catch {
    /* ignore */
  }
}

export function listPinnedDestinations(limit = MAX_PINNED): PinnedDestination[] {
  return readAll().slice(0, limit);
}

export function isPinnedDestination(href: string): boolean {
  return readAll().some((row) => row.href === href);
}

/** Keep only pins whose href is still a live gated destination. */
export function filterLivePinned(
  pins: PinnedDestination[],
  liveHrefs: Iterable<string>,
): PinnedDestination[] {
  const allowed = new Set(liveHrefs);
  return pins.filter((pin) => allowed.has(pin.href));
}

export function togglePinnedDestination(input: {
  key: string;
  label: string;
  href: string;
}): PinnedDestination[] {
  if (typeof window === "undefined") return [];
  const current = readAll();
  const exists = current.some((row) => row.href === input.href);
  const next = exists
    ? current.filter((row) => row.href !== input.href)
    : [
        {
          key: input.key,
          label: input.label,
          href: input.href,
          pinnedAt: new Date().toISOString(),
        },
        ...current.filter((row) => row.href !== input.href),
      ].slice(0, MAX_PINNED);
  writeAll(next);
  return next;
}
