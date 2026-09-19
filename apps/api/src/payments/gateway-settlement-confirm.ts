import { createLogger } from "@dang/observability";
import type { LedgerStore } from "../ledger/ledger.types.js";
import {
  toSettlementSummary,
  type SettlementStore,
} from "../settlements/settlement.types.js";

const logger = createLogger("dang-api-payments-gateway");

/** Synthetic actor for PSP-driven settlement confirm (no interactive user). */
export const ZARINPAL_SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000021";

/**
 * After real PSP verify: confirm linked settlement and post journal.
 * Bypasses interactive MFA/party checks — authority is the verified payment.
 */
export async function confirmSettlementFromGateway(input: {
  settlements: SettlementStore;
  ledger: LedgerStore;
  workspaceId: string;
  settlementId: string;
  actorUserId?: string;
}): Promise<void> {
  const actorUserId = input.actorUserId ?? ZARINPAL_SYSTEM_ACTOR;
  const { workspaceId, settlementId, settlements, ledger } = input;
  try {
    const existing = await settlements.get(
      workspaceId,
      settlementId,
      actorUserId,
    );
    if (!existing) {
      logger.warn("Zarinpal verify: linked settlement not found", {
        workspaceId,
        settlementId,
      });
      return;
    }
    if (existing.status === "confirmed") {
      await ledger.postSettlement(actorUserId, toSettlementSummary(existing));
      return;
    }
    if (existing.status !== "claimed") {
      logger.warn("Zarinpal verify: settlement not in claimable state", {
        settlementId,
        status: existing.status,
      });
      return;
    }
    const confirmed = await settlements.confirm(
      workspaceId,
      settlementId,
      actorUserId,
    );
    await ledger.postSettlement(actorUserId, toSettlementSummary(confirmed));
    logger.info("Settlement confirmed after Zarinpal verify", {
      settlementId,
      workspaceId,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("Failed to confirm settlement after Zarinpal verify", {
      detail,
      settlementId,
      workspaceId,
    });
  }
}
