import type {
  CostCenterSummary,
  PettyCashFundSummary,
  SystemCapabilities,
} from "@dang/contracts";
import { api } from "@/lib/api";
import type { SplitPresetListItem } from "@/components/views/finance/finance-split-preset";

export type FinanceSideData = {
  costCenters: CostCenterSummary[];
  requireCostCenter: boolean;
  pettyCashFunds: PettyCashFundSummary[];
  catalogOptions: Array<{ id: string; name: string }>;
  categoryOptions: Array<{ id: string; name: string }>;
  tagOptions: Array<{ id: string; name: string }>;
  splitPresets: SplitPresetListItem[];
};

/**
 * Secondary finance loads (policy, catalog, presets) — kept out of finance-view.tsx.
 */
export async function loadFinanceSideData(
  workspaceId: string,
  capabilities: SystemCapabilities | null | undefined,
): Promise<FinanceSideData> {
  let costCenters: FinanceSideData["costCenters"] = [];
  let requireCostCenter = false;
  let pettyCashFunds: FinanceSideData["pettyCashFunds"] = [];
  let catalogOptions: FinanceSideData["catalogOptions"] = [];
  let categoryOptions: FinanceSideData["categoryOptions"] = [];
  let tagOptions: FinanceSideData["tagOptions"] = [];
  let splitPresets: SplitPresetListItem[] = [];

  if (capabilities?.productFlags?.costCenter) {
    const centers = await api.listCostCenters(workspaceId).catch(() => []);
    costCenters = centers.filter((c) => c.active);
  }
  if (capabilities?.productFlags?.expensePolicy) {
    const pol = await api.getExpensePolicy(workspaceId).catch(() => null);
    requireCostCenter = Boolean(pol?.requireCostCenter);
  }
  if (capabilities?.providers?.pettyCash === "fund_v1") {
    const funds = await api.listPettyCash(workspaceId).catch(() => []);
    pettyCashFunds = funds.filter((f) => f.active);
  }
  if (capabilities?.providers?.catalog === "catalog_v1") {
    const page = await api
      .listCatalogItems(workspaceId, { activeOnly: true, limit: 100 })
      .catch(() => null);
    catalogOptions = (page?.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
    }));
  }
  const cats = await api.listCategories(workspaceId).catch(() => []);
  categoryOptions = cats.map((c) => ({ id: c.id, name: c.name }));
  const tags = await api.listExpenseTags(workspaceId).catch(() => []);
  tagOptions = tags.map((t) => ({ id: t.id, name: t.name }));
  const presets = await api.listSplitPresets(workspaceId).catch(() => []);
  splitPresets = presets.map((p) => ({
    id: p.id,
    name: p.name,
    splitMethod: p.splitMethod,
    lines: p.lines,
  }));

  return {
    costCenters,
    requireCostCenter,
    pettyCashFunds,
    catalogOptions,
    categoryOptions,
    tagOptions,
    splitPresets,
  };
}
