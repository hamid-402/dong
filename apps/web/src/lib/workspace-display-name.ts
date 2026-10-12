import { spaceKindForTemplate, type WorkspaceTemplate } from "@dang/contracts";
import { spaceTabLabel } from "@/lib/nav-labels";

/**
 * Human label for a workspace in chrome/breadcrumbs.
 * Keeps the stored name. Kind label is only the fallback when the name is empty.
 */
export function workspaceDisplayName(
  name: string | null | undefined,
  template?: string | null,
  fallback = "فضا",
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;
  if (template) {
    try {
      return spaceTabLabel(spaceKindForTemplate(template as WorkspaceTemplate));
    } catch {
      /* ignore invalid template */
    }
  }
  return fallback;
}
