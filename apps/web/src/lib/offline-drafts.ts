export type OfflineExpenseDraft = {
  id: string;
  workspaceId: string;
  title: string;
  totalToman: string;
  paidByUserId?: string;
  participantUserIds: string[];
  splitMethod: "equal" | "amount" | "percent" | "shares";
  occurredOn: string;
  note?: string;
  updatedAt: string;
};

const KEY = "dang.offline.expenseDrafts";

function readAll(): OfflineExpenseDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineExpenseDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: OfflineExpenseDraft[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rows));
}

export function listOfflineExpenseDrafts(workspaceId?: string): OfflineExpenseDraft[] {
  const all = readAll();
  return workspaceId ? all.filter((d) => d.workspaceId === workspaceId) : all;
}

export function saveOfflineExpenseDraft(
  draft: Omit<OfflineExpenseDraft, "id" | "updatedAt"> & { id?: string },
): OfflineExpenseDraft {
  const all = readAll();
  const id = draft.id ?? crypto.randomUUID();
  const row: OfflineExpenseDraft = {
    ...draft,
    id,
    updatedAt: new Date().toISOString(),
  };
  const next = [...all.filter((d) => d.id !== id), row];
  writeAll(next);
  return row;
}

export function removeOfflineExpenseDraft(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
}
