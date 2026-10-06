import { spaceKindForTemplate, type WorkspaceTemplate } from "@dang/contracts";
import { spaceTabLabel } from "@/lib/nav-labels";

/** Single-token slugs (e.g. demo "vidaverse") — not a human title. */
const LATIN_SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;

/**
 * Human label for a workspace in chrome/breadcrumbs.
 * Cuts English demo names like "vidaverse" in favor of the Persian kind label.
 */
export function workspaceDisplayName(
  name: string | null | undefined,
  template?: string | null,
  fallback = "فضا",
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed && !LATIN_SLUG.test(trimmed)) return trimmed;
  if (template) {
    try {
      return spaceTabLabel(spaceKindForTemplate(template as WorkspaceTemplate));
    } catch {
      /* ignore invalid template */
    }
  }
  return fallback;
}
