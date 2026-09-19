import type { WorkspacePayoutInstructions } from "@dang/contracts";

export type PayoutInstructionsRecord = WorkspacePayoutInstructions & {
  workspaceId: string;
  updatedByUserId: string;
  updatedAt: string;
};

export type PayoutInstructionsStore = {
  readonly persistence: "memory" | "postgres";
  get(workspaceId: string, actorUserId: string): Promise<PayoutInstructionsRecord | null>;
  upsert(
    workspaceId: string,
    actorUserId: string,
    input: {
      holderName: string;
      destinationKind: "card" | "iban";
      destinationValue: string;
      bankName?: string;
    },
  ): Promise<PayoutInstructionsRecord>;
  /** Remove workspace payout profile; returns true when a row existed. */
  clear(workspaceId: string, actorUserId: string): Promise<boolean>;
};

export const PAYOUT_INSTRUCTIONS_STORE = Symbol("PAYOUT_INSTRUCTIONS_STORE");
