/**
 * Workspace directory — scalable list for switcher / finder / kind hub.
 * Metrics fields are optional; omit rather than invent.
 * Local type aliases avoid circular import with index.ts.
 */

type WorkspaceTemplate =
  | "personal"
  | "friends_family"
  | "household"
  | "project_partners"
  | "small_team"
  | "construction"
  | "residential_building";

type SpaceKind = "personal" | "group" | "building" | "org";

type MembershipRole =
  | "owner"
  | "admin"
  | "finance"
  | "deputy_finance"
  | "approver"
  | "buyer"
  | "asset_custodian"
  | "member"
  | "auditor"
  | "guest";

/** Mirrors workspaceTemplateCatalog spaceKind — keep in sync with index.ts. */
function spaceKindOf(template: WorkspaceTemplate): SpaceKind {
  switch (template) {
    case "personal":
      return "personal";
    case "residential_building":
    case "construction":
      return "building";
    case "project_partners":
    case "small_team":
      return "org";
    default:
      return "group";
  }
}

export type WorkspaceDirectoryEntry = {
  id: string;
  name: string;
  slug: string;
  template: WorkspaceTemplate;
  spaceKind: SpaceKind;
  /** Actor membership role in this workspace (from list join). */
  myRole: MembershipRole;
  timezone: string;
  displayUnit: "toman" | "rial";
  archivedAt?: string;
  /**
   * Optional live metrics — only when computed cheaply by directory API.
   * UI must tolerate absence (no fake zeros).
   */
  myNetMinor?: string;
  openSettlements?: number;
};

export type WorkspaceDirectoryResponse = {
  generatedAt: string;
  entries: WorkspaceDirectoryEntry[];
  /**
   * True only when this response attempted and attached live metrics.
   * Absent/false → UI must not invent zeros.
   */
  metricsIncluded?: boolean;
  /**
   * Why metrics were skipped despite a request — honest signal for clients.
   */
  metricsOmittedReason?: "not_requested" | "too_many_workspaces" | "partial_failures";
};

/** Soft cap — beyond this, directory refuses metrics rather than N+1 thrash. */
export const DIRECTORY_METRICS_WORKSPACE_CAP = 40;

export type WorkspaceDirectorySource = {
  id: string;
  name: string;
  slug: string;
  template: WorkspaceTemplate;
  timezone: string;
  displayUnit: "toman" | "rial";
  archivedAt?: string;
  myRole: MembershipRole;
  myNetMinor?: string;
  openSettlements?: number;
};

/** Map a membership-scoped workspace row into a directory entry. */
export function toDirectoryEntry(
  workspace: WorkspaceDirectorySource,
): WorkspaceDirectoryEntry {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    template: workspace.template,
    spaceKind: spaceKindOf(workspace.template),
    myRole: workspace.myRole,
    timezone: workspace.timezone,
    displayUnit: workspace.displayUnit,
    archivedAt: workspace.archivedAt,
    myNetMinor: workspace.myNetMinor,
    openSettlements: workspace.openSettlements,
  };
}
