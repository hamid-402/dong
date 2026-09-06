import type { WorkspaceTemplate } from "@dang/contracts";
import { spaceKindForTemplate, workspaceTemplateCatalog } from "@dang/contracts";
import type { NavNode } from "@/lib/navigation-types";
import { RAW_MENU_ITEMS } from "@/lib/app-navigation";
import { hubPathFor } from "@/lib/hub-links";

const MODULE_KEYS = {
  expenses: ["finance", "/workspaces", "/daily-ledger"],
  settlements: ["finance", "/workspaces", "/daily-ledger"],
  invites: ["finance", "/workspaces/invite", "group", "spaces"],
  procurement: ["buy", "/workspaces/procurement"],
  proposals: ["buy", "/proposals"],
  assets: ["buy", "/workspaces/assets"],
  assets_light: ["buy", "/workspaces/assets"],
  budgets: ["buy", "/workspaces/procurement"],
  approvals: ["buy", "/workspaces/procurement"],
  partnerships: ["partners", "/workspaces/partnership"],
  reports: ["partners", "/workspaces/partnership"],
  projects: ["partners", "/workspaces/partnership"],
} as const;

export function modulesForTemplate(template: WorkspaceTemplate | undefined): Set<string> {
  const item = workspaceTemplateCatalog.find((entry) => entry.id === template);
  return new Set(item?.defaultModules ?? ["expenses", "settlements", "invites"]);
}

export function navKeysForTemplate(template: WorkspaceTemplate | undefined): Set<string> {
  const modules = modulesForTemplate(template);
  const keys = new Set<string>([
    "overview",
    "manage",
    "/onboarding",
    "/invite",
    "/profile",
    "group",
    "spaces",
    "/me",
    "/group",
    "/orgs",
  ]);
  for (const mod of modules) {
    const mapped = MODULE_KEYS[mod as keyof typeof MODULE_KEYS];
    if (!mapped) continue;
    for (const key of mapped) keys.add(key);
  }
  return keys;
}

function filterNode(node: NavNode, allowed: Set<string>): NavNode | null {
  if (node.isGroup && node.children) {
    if (!allowed.has(node.key)) return null;
    const children = node.children
      .map((child) => filterNode(child, allowed))
      .filter((child): child is NavNode => child !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  }
  if (node.key === "overview") return node;
  if (node.route && allowed.has(node.route)) return node;
  if (allowed.has(node.key)) return node;
  return null;
}

/** Filter hub menu by workspace template modules. */
export function buildNavForTemplate(template: WorkspaceTemplate | undefined): NavNode[] {
  const allowed = navKeysForTemplate(template);
  return RAW_MENU_ITEMS.map((node) => filterNode(node, allowed)).filter(
    (node): node is NavNode => node !== null,
  );
}

export type HubTab = {
  key: string;
  path: string;
  label: string;
  icon: "home" | "wallet" | "partners" | "box" | "cart" | "settings" | "receipt";
};

/**
 * Single dock row: Home · active space · Expenses · More.
 * Former tabs (من/گروه/خرید/…) stay reachable via space home, finance folder, or More/all-tools.
 */
export function bottomTabsForTemplate(template: WorkspaceTemplate | undefined): HubTab[] {
  const allowed = navKeysForTemplate(template);
  const kind = spaceKindForTemplate(template);

  const spaceTab: HubTab =
    kind === "org"
      ? { key: "space", path: hubPathFor("/orgs"), label: "سازمان", icon: "box" }
      : kind === "personal"
        ? { key: "space", path: hubPathFor("/me"), label: "من", icon: "wallet" }
        : { key: "space", path: hubPathFor("/group"), label: "گروه", icon: "partners" };

  const tabs: HubTab[] = [
    { key: "home", path: "/hub", label: "خانه", icon: "home" },
    spaceTab,
    { key: "finance", path: "/hub/finance", label: "خرج‌ها", icon: "wallet" },
    { key: "more", path: "/hub/manage", label: "بیشتر", icon: "settings" },
  ];

  return tabs.filter((tab) => {
    if (tab.key === "finance") return allowed.has("finance");
    return true;
  });
}

/** Flat classic sidebar links derived from the same filtered tree (no divergent menu). */
export function classicNavForTemplate(template: WorkspaceTemplate | undefined): HubTab[] {
  const tree = buildNavForTemplate(template);
  const links: HubTab[] = [{ key: "home", path: "/hub", label: "خانه", icon: "home" }];

  const walk = (nodes: NavNode[]) => {
    for (const node of nodes) {
      if (node.isGroup && node.children) {
        links.push({
          key: node.key,
          path: `/hub/${node.key}`,
          label: node.label,
          icon: (node.icon as HubTab["icon"]) ?? "settings",
        });
        continue;
      }
      if (node.route) {
        links.push({
          key: node.key,
          path: hubPathFor(node.route),
          label: node.label,
          icon: (node.icon as HubTab["icon"]) ?? "settings",
        });
      }
    }
  };
  walk(tree);
  return links;
}

export function templateSupportsCompanyExpenses(
  _template: WorkspaceTemplate | undefined,
): boolean {
  // Daily shared/company column is available for all workspace templates.
  return true;
}
