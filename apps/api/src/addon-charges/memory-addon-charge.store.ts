import type {
  CreatePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";
import type {
  AddonChargeStore,
  AddonChargeTransition,
} from "./addon-charges.types.js";

type StoredAddonCharge = PersonalAddonChargeSummary & {
  idempotencyKey: string;
};

export class MemoryAddonChargeStore implements AddonChargeStore {
  readonly persistence = "memory" as const;
  private readonly charges = new Map<string, StoredAddonCharge>();

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreatePersonalAddonChargeRequest,
  ): Promise<PersonalAddonChargeSummary> {
    const idempotencyKey = input.idempotencyKey.trim();
    const existing = [...this.charges.values()].find(
      (charge) =>
        charge.workspaceId === workspaceId &&
        charge.idempotencyKey === idempotencyKey,
    );
    if (existing) return Promise.resolve(this.toSummary(existing));

    const now = new Date().toISOString();
    const charge: StoredAddonCharge = {
      id: crypto.randomUUID(),
      workspaceId,
      targetMemberUserId: input.targetMemberUserId,
      createdByUserId: actorUserId,
      amount: input.amount,
      title: input.title.trim(),
      note: input.note?.trim() || undefined,
      categoryId: input.categoryId,
      linkedExpenseId: input.linkedExpenseId,
      status: "pending_ack",
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    this.charges.set(charge.id, charge);
    return Promise.resolve(this.toSummary(charge));
  }

  list(
    workspaceId: string,
    _actorUserId: string,
  ): Promise<PersonalAddonChargeSummary[]> {
    void _actorUserId;
    return Promise.resolve(
      [...this.charges.values()]
        .filter((charge) => charge.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((charge) => this.toSummary(charge)),
    );
  }

  get(
    workspaceId: string,
    chargeId: string,
    _actorUserId: string,
  ): Promise<PersonalAddonChargeSummary | null> {
    void _actorUserId;
    const charge = this.charges.get(chargeId);
    return Promise.resolve(
      charge?.workspaceId === workspaceId ? this.toSummary(charge) : null,
    );
  }

  transition(
    workspaceId: string,
    chargeId: string,
    _actorUserId: string,
    next: AddonChargeTransition,
    note?: string,
  ): Promise<PersonalAddonChargeSummary> {
    void _actorUserId;
    const charge = this.charges.get(chargeId);
    if (!charge || charge.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ADDON_CHARGE_NOT_FOUND"));
    }
    if (charge.status !== "pending_ack") {
      return Promise.reject(new Error("ADDON_CHARGE_STATUS"));
    }

    const updated: StoredAddonCharge = {
      ...charge,
      status: next,
      note:
        next === "disputed" && note !== undefined
          ? note.trim() || undefined
          : charge.note,
      updatedAt: new Date().toISOString(),
    };
    this.charges.set(chargeId, updated);
    return Promise.resolve(this.toSummary(updated));
  }

  private toSummary(charge: StoredAddonCharge): PersonalAddonChargeSummary {
    const { idempotencyKey: _idempotencyKey, ...summary } = charge;
    void _idempotencyKey;
    return summary;
  }
}
