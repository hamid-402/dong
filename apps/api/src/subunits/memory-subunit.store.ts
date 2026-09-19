import { randomUUID } from "node:crypto";
import type {
  CreateWorkspaceSubunitBody,
  UpdateWorkspaceSubunitBody,
  WorkspaceSubunitSummary,
} from "@dang/contracts";
import type { WorkspaceSubunitStore } from "./subunit.types.js";

type Row = {
  id: string;
  workspaceId: string;
  kind: WorkspaceSubunitSummary["kind"];
  code: string;
  name: string;
  note?: string;
  sortOrder: number;
  areaSqm?: number;
  occupancy?: number;
  memberUserIds: Set<string>;
  createdAt: string;
};

export class MemoryWorkspaceSubunitStore implements WorkspaceSubunitStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, Row>();

  list(workspaceId: string): Promise<WorkspaceSubunitSummary[]> {
    const list = [...this.rows.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map(toSummary);
    return Promise.resolve(list);
  }

  create(
    workspaceId: string,
    _actorUserId: string,
    body: CreateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    const code = body.code.trim();
    for (const row of this.rows.values()) {
      if (row.workspaceId === workspaceId && row.code.toLowerCase() === code.toLowerCase()) {
        return Promise.reject(new Error("SUBUNIT_CODE_EXISTS"));
      }
    }
    const row: Row = {
      id: randomUUID(),
      workspaceId,
      kind: body.kind,
      code,
      name: body.name.trim(),
      note: body.note?.trim() || undefined,
      sortOrder: body.sortOrder ?? this.rows.size,
      areaSqm: body.areaSqm,
      occupancy: body.occupancy,
      memberUserIds: new Set(),
      createdAt: new Date().toISOString(),
    };
    this.rows.set(row.id, row);
    return Promise.resolve(toSummary(row));
  }

  update(
    workspaceId: string,
    subunitId: string,
    _actorUserId: string,
    body: UpdateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    const row = this.rows.get(subunitId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("SUBUNIT_NOT_FOUND"));
    }
    if (body.name !== undefined) row.name = body.name.trim();
    if (body.note !== undefined) row.note = body.note?.trim() || undefined;
    if (body.sortOrder !== undefined) row.sortOrder = body.sortOrder;
    if (body.memberUserIds) {
      row.memberUserIds = new Set(body.memberUserIds);
    }
    if (body.areaSqm !== undefined) {
      row.areaSqm = body.areaSqm ?? undefined;
    }
    if (body.occupancy !== undefined) {
      row.occupancy = body.occupancy ?? undefined;
    }
    return Promise.resolve(toSummary(row));
  }

  remove(workspaceId: string, subunitId: string): Promise<void> {
    const row = this.rows.get(subunitId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("SUBUNIT_NOT_FOUND"));
    }
    this.rows.delete(subunitId);
    return Promise.resolve();
  }
}

function toSummary(row: Row): WorkspaceSubunitSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    code: row.code,
    name: row.name,
    note: row.note,
    sortOrder: row.sortOrder,
    areaSqm: row.areaSqm,
    occupancy: row.occupancy,
    memberUserIds: [...row.memberUserIds],
    createdAt: row.createdAt,
  };
}
