import type {
  CreateExpenseTagRequest,
  ExpenseTagSummary,
} from "@dang/contracts";

export type ExpenseTagsStore = {
  readonly persistence: "memory" | "postgres";
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateExpenseTagRequest,
  ): Promise<ExpenseTagSummary>;
  list(workspaceId: string, actorUserId: string): Promise<ExpenseTagSummary[]>;
  setExpenseTags(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    tagIds: string[],
  ): Promise<string[]>;
  listTagIdsForExpense(
    workspaceId: string,
    expenseId: string,
  ): Promise<string[]>;
  listExpenseIdsWithTag(
    workspaceId: string,
    tagId: string,
  ): Promise<string[]>;
};

export const EXPENSE_TAGS_STORE = Symbol("EXPENSE_TAGS_STORE");

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .slice(0, 48) || "tag";
}

export class MemoryExpenseTagsStore implements ExpenseTagsStore {
  readonly persistence = "memory" as const;
  private readonly tags = new Map<string, ExpenseTagSummary>();
  private readonly idempotency = new Map<string, string>();
  /** expenseId → tagIds */
  private readonly links = new Map<string, Set<string>>();

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateExpenseTagRequest,
  ): Promise<ExpenseTagSummary> {
    const name = input.name?.trim();
    if (!name || name.length > 64) {
      return Promise.reject(new Error("TAG_NAME"));
    }
    const idemKey = `${workspaceId}:${input.idempotencyKey.trim()}`;
    const existingId = this.idempotency.get(idemKey);
    if (existingId) {
      const existing = this.tags.get(existingId);
      if (existing) return Promise.resolve(existing);
    }
    const slug = (input.slug?.trim() || slugify(name)).slice(0, 48);
    for (const tag of this.tags.values()) {
      if (tag.workspaceId === workspaceId && tag.slug === slug) {
        return Promise.reject(new Error("TAG_SLUG_TAKEN"));
      }
    }
    const tag: ExpenseTagSummary = {
      id: crypto.randomUUID(),
      workspaceId,
      name,
      slug,
      color: input.color?.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdByUserId: actorUserId,
    };
    this.tags.set(tag.id, tag);
    this.idempotency.set(idemKey, tag.id);
    return Promise.resolve(tag);
  }

  list(workspaceId: string, _actorUserId: string): Promise<ExpenseTagSummary[]> {
    void _actorUserId;
    return Promise.resolve(
      [...this.tags.values()]
        .filter((t) => t.workspaceId === workspaceId)
        .sort((a, b) => a.name.localeCompare(b.name, "fa")),
    );
  }

  setExpenseTags(
    workspaceId: string,
    expenseId: string,
    _actorUserId: string,
    tagIds: string[],
  ): Promise<string[]> {
    void _actorUserId;
    const unique = [...new Set(tagIds.map((id) => id.trim()).filter(Boolean))];
    for (const id of unique) {
      const tag = this.tags.get(id);
      if (!tag || tag.workspaceId !== workspaceId) {
        return Promise.reject(new Error("TAG_NOT_FOUND"));
      }
    }
    this.links.set(expenseId, new Set(unique));
    return Promise.resolve(unique);
  }

  listTagIdsForExpense(workspaceId: string, expenseId: string): Promise<string[]> {
    void workspaceId;
    return Promise.resolve([...(this.links.get(expenseId) ?? [])]);
  }

  listExpenseIdsWithTag(workspaceId: string, tagId: string): Promise<string[]> {
    const tag = this.tags.get(tagId);
    if (!tag || tag.workspaceId !== workspaceId) return Promise.resolve([]);
    const ids: string[] = [];
    for (const [expenseId, set] of this.links) {
      if (set.has(tagId)) ids.push(expenseId);
    }
    return Promise.resolve(ids);
  }
}
