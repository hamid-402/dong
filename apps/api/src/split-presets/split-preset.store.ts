import type {
  CreateSplitPresetRequest,
  SplitPresetSummary,
} from "@dang/contracts";

export type SplitPresetStore = {
  readonly persistence: "memory" | "postgres";
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateSplitPresetRequest,
  ): Promise<SplitPresetSummary>;
  list(workspaceId: string): Promise<SplitPresetSummary[]>;
  get(workspaceId: string, presetId: string): Promise<SplitPresetSummary | undefined>;
  delete(workspaceId: string, presetId: string): Promise<boolean>;
};

export const SPLIT_PRESET_STORE = Symbol("SPLIT_PRESET_STORE");

export class MemorySplitPresetStore implements SplitPresetStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, SplitPresetSummary & { idempotencyKey: string }>();
  private readonly idempotency = new Map<string, string>();

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateSplitPresetRequest,
  ): Promise<SplitPresetSummary> {
    const name = input.name?.trim();
    if (!name || name.length > 80) return Promise.reject(new Error("PRESET_NAME"));
    if (!input.lines?.length) return Promise.reject(new Error("PRESET_LINES"));
    const idemKey = `${workspaceId}:${input.idempotencyKey.trim()}`;
    const existingId = this.idempotency.get(idemKey);
    if (existingId) {
      const existing = this.rows.get(existingId);
      if (existing) {
        const { idempotencyKey: _, ...summary } = existing;
        return Promise.resolve(summary);
      }
    }
    const id = crypto.randomUUID();
    const stored = {
      id,
      workspaceId,
      name,
      splitMethod: input.splitMethod,
      lines: input.lines,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.rows.set(id, stored);
    this.idempotency.set(idemKey, id);
    const { idempotencyKey: _, ...summary } = stored;
    return Promise.resolve(summary);
  }

  list(workspaceId: string): Promise<SplitPresetSummary[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .map(({ idempotencyKey: _, ...s }) => s)
        .sort((a, b) => a.name.localeCompare(b.name, "fa")),
    );
  }

  get(workspaceId: string, presetId: string): Promise<SplitPresetSummary | undefined> {
    const row = this.rows.get(presetId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    const { idempotencyKey: _, ...summary } = row;
    return Promise.resolve(summary);
  }

  delete(workspaceId: string, presetId: string): Promise<boolean> {
    const row = this.rows.get(presetId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(false);
    this.rows.delete(presetId);
    return Promise.resolve(true);
  }
}
