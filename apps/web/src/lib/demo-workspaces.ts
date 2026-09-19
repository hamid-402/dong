import type { WorkspaceSummary } from "@dang/contracts";

/**
 * Soft-purged or ephemeral demo/test workspaces — hide from normal product chrome
 * so the hub is ready for real data. Seed remains behind explicit «دمو» actions.
 */
export function isHiddenDemoWorkspace(workspace: WorkspaceSummary): boolean {
  const slug = workspace.slug.toLowerCase();
  const name = workspace.name;
  if (name.includes("پاک‌شده")) return true;
  if (slug.startsWith("demo-aftab")) return true;
  if (slug.startsWith("demo-colleagues") && name.includes("دمو")) {
    // Active colleagues demo stays visible with دمو label; purged already caught above.
    return false;
  }
  if (/^friends-(test|proxy|prop)-/.test(slug)) return true;
  return false;
}

export function filterVisibleWorkspaces(
  workspaces: WorkspaceSummary[],
): WorkspaceSummary[] {
  return workspaces.filter((w) => !isHiddenDemoWorkspace(w));
}
