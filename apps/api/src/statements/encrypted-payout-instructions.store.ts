import type {
  PayoutInstructionsRecord,
  PayoutInstructionsStore,
} from "./payout-instructions.types.js";
import {
  openPayoutDestination,
  sealPayoutDestination,
} from "./payout-destination-crypto.js";

/**
 * Additive encryption layer: destination_value sealed at rest when master key exists.
 * Inner store never sees plaintext on write when sealing is active.
 */
export class EncryptedPayoutInstructionsStore implements PayoutInstructionsStore {
  constructor(private readonly inner: PayoutInstructionsStore) {}

  get persistence(): "memory" | "postgres" {
    return this.inner.persistence;
  }

  async get(
    workspaceId: string,
    actorUserId: string,
  ): Promise<PayoutInstructionsRecord | null> {
    const row = await this.inner.get(workspaceId, actorUserId);
    if (!row) return null;
    return {
      ...row,
      destinationValue: openPayoutDestination(workspaceId, row.destinationValue),
    };
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
    const sealed = await this.inner.upsert(workspaceId, actorUserId, {
      ...input,
      destinationValue: sealPayoutDestination(workspaceId, input.destinationValue),
    });
    return {
      ...sealed,
      destinationValue: openPayoutDestination(workspaceId, sealed.destinationValue),
    };
  }

  async clear(workspaceId: string, actorUserId: string): Promise<boolean> {
    return this.inner.clear(workspaceId, actorUserId);
  }
}
