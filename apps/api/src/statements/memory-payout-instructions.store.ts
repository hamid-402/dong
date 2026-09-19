import type { PayoutInstructionsRecord, PayoutInstructionsStore } from "./payout-instructions.types.js";

export class MemoryPayoutInstructionsStore implements PayoutInstructionsStore {
  readonly persistence = "memory" as const;
  private readonly byWorkspace = new Map<string, PayoutInstructionsRecord>();

  async get(
    workspaceId: string,
    _actorUserId: string,
  ): Promise<PayoutInstructionsRecord | null> {
    void _actorUserId;
    return this.byWorkspace.get(workspaceId) ?? null;
  }

  async upsert(
    workspaceId: string,
    actorUserId: string,
    input: {
      holderName: string;
      destinationKind: "card" | "iban";
      destinationValue: string;
      bankName?: string;
    },
  ): Promise<PayoutInstructionsRecord> {
    const record: PayoutInstructionsRecord = {
      workspaceId,
      holderName: input.holderName.trim(),
      destinationKind: input.destinationKind,
      destinationValue:
        input.destinationKind === "iban"
          ? input.destinationValue.trim().toUpperCase()
          : input.destinationValue.trim(),
      bankName: input.bankName?.trim() || undefined,
      updatedByUserId: actorUserId,
      updatedAt: new Date().toISOString(),
    };
    this.byWorkspace.set(workspaceId, record);
    return record;
  }

  async clear(workspaceId: string, _actorUserId: string): Promise<boolean> {
    void _actorUserId;
    return this.byWorkspace.delete(workspaceId);
  }
}
