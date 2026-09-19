/**
 * S11-12 IA-UX page pattern checklist (docs/stage11/IA-UX.md §5).
 * High-traffic sources must import `WorkspacePageFrame` — enforced by page-pattern.test.ts.
 */
export const MAX_BREADCRUMB_DEPTH = 3;

export const PAGE_PATTERN_CHECKLIST = [
  "shell page trail: back + breadcrumb (≤3 levels)",
  "title + one-line description",
  "exactly one primary CTA",
  "module strip only for sibling-family destinations (not primary tabs)",
  "EmptyHint for empty",
  "StatusLine (or EmptyHint+retry) for error",
  "ContentSkeleton for loading",
] as const;

/** Repo-relative paths under apps/web/src — high-traffic workspace (and Stage11) surfaces. */
export const HIGH_TRAFFIC_PAGE_SOURCES = [
  "components/views/overview-view.tsx",
  "components/shell/shell-tools-view.tsx",
  "components/views/finance-view.tsx",
  "app/w/[slug]/addons/page.tsx",
  "app/w/[slug]/settings/page.tsx",
  "app/w/[slug]/approvals/page.tsx",
  "app/w/[slug]/audit/page.tsx",
  "components/views/daily-ledger-view.tsx",
  "components/views/product-metrics-view.tsx",
  "components/views/jobs-view.tsx",
  "components/views/friends-group-view.tsx",
  "components/views/org-space-view.tsx",
  "components/views/personal-space-view.tsx",
  "components/views/catalog-view.tsx",
  "components/views/payments-view.tsx",
  "components/views/statements-view.tsx",
  "components/views/workspace-charts-view.tsx",
  "components/views/workspace-permissions-view.tsx",
  "app/w/[slug]/security-ops/page.tsx",
  "components/views/partnership-view.tsx",
  "components/views/assets-view.tsx",
  "components/views/procurement-view.tsx",
  "components/views/building-space-view.tsx",
  "components/views/subunits-view.tsx",
] as const;
