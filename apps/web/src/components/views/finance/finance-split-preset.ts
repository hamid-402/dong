import type { SplitMethod } from "@dang/contracts";
import type { SplitComposerValue } from "@/components/split-composer";
import { api } from "@/lib/api";
import { newClientId } from "@/lib/id";

export type SplitPresetListItem = {
  id: string;
  name: string;
  splitMethod: SplitMethod;
  lines: Array<{
    userId: string;
    shares?: number;
    percentBp?: number;
    amountMinor?: string;
  }>;
};

export function buildSplitPresetLines(split: SplitComposerValue) {
  return split.participantUserIds.map((userId) => {
    if (split.splitMethod === "shares") {
      return {
        userId,
        shares: Number(split.lineInputs[userId] || "1") || 1,
      };
    }
    if (split.splitMethod === "percent") {
      const pct = Number(split.lineInputs[userId] || "0");
      return {
        userId,
        percentBp: Math.round(pct * 100),
      };
    }
    if (split.splitMethod === "amount") {
      const toman = Number(split.lineInputs[userId] || "0");
      return {
        userId,
        amountMinor: String(Math.round(toman * 10)),
      };
    }
    return { userId, shares: 1 };
  });
}

export async function saveSplitPresetAndReload(
  workspaceId: string,
  name: string,
  split: SplitComposerValue,
): Promise<SplitPresetListItem[]> {
  const lines = buildSplitPresetLines(split);
  await api.createSplitPreset(workspaceId, {
    name,
    splitMethod:
      split.splitMethod === "itemized" || split.splitMethod === "formula"
        ? "equal"
        : split.splitMethod,
    lines,
    idempotencyKey: newClientId(),
  });
  const presets = await api.listSplitPresets(workspaceId);
  return presets.map((p) => ({
    id: p.id,
    name: p.name,
    splitMethod: p.splitMethod,
    lines: p.lines,
  }));
}
