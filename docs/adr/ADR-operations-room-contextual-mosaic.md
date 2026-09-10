# ADR: Operations Room with Contextual Mosaic Hubs

Status: Accepted and locked for additive rollout  
Date: 2026-09-08

## Decision

The product shell follows one hybrid interaction model:

- **Operations Room** is the default frame for data-heavy work: dashboards, queues,
  tables, forms, decision workflows, audit history, and master-detail inspectors.
- **Contextual Mosaic Hubs** are used only for destination selection, resuming recent
  work, and switching between related modules.

Both presentations must be generated from the same canonical navigation, workspace
template, product capabilities, and authorization state. A mosaic tile must never
introduce a second route taxonomy or bypass an API authorization check.

## Locked constraints

1. Existing product logic, routes, APIs, permissions, and useful features are not
   removed. Replacement is allowed only after equivalent or better behavior,
   migration, compatibility routing, and regression coverage exist.
2. Changes are additive. Database migrations must be forward-only and preserve
   existing records.
3. No runtime status, count, security claim, or persistence claim may be displayed
   without an API/DB source. Missing data uses explicit loading, empty, unavailable,
   or forbidden states.
4. Every visible action has a real route or handler. Provider stubs stay hidden or
   are explicitly identified as unavailable.
5. Mosaic hubs contain at most eight primary choices per section. Dense tables,
   editors, and forms remain Operations Room surfaces.
6. Desktop and mobile share the same information architecture. Mobile may change
   presentation (dock, sheet, stacked inspector), not remove capabilities.
7. Keyboard navigation, focus visibility, reduced motion, RTL, and WCAG AA contrast
   are release requirements.

## Information-density contract

Each operational screen should expose information in this order:

1. real summary and critical state;
2. primary work surface;
3. search/filter/sort controls;
4. selected-item inspector;
5. history and audit evidence;
6. permitted actions;
7. a concrete reason for hidden or disabled actions.

Secondary detail is progressively disclosed. Decorative controls or duplicate
navigation are not allowed.

## Rollout

1. Protect the existing route/capability inventory with tests.
2. Establish shared tokens, shell, navigation, and contextual mosaic metadata.
3. Upgrade workspace home and all-tools without replacing their APIs.
4. Migrate finance, governance, procurement, assets, partnership, account, and
   authentication surfaces in reviewable slices.
5. Classic and `/hub/*` bookmarks stay as compatibility redirects onto `/w/[slug]/…`.
   Finance panel hashes under `/workspaces#…` (and hub URLs carrying the same hashes)
   resolve to the split section routes. Legacy presentation is not removed while
   DESIGN-SYSTEM §12 traffic review is open. Business logic remains in its existing
   domain layer.

## Stage status (additive)

| Stage | Focus | Status |
|---|---|---|
| 1–8 | Inventory, shell, mosaic, Operations Room density | Done |
| 9 | Performance / a11y / lazy routes | Done |
| 10 | Classic route compatibility + hash-aware finance deep links | Done |

## Consequences

- The product gains a consistent premium visual language without turning every
  screen into a tile dashboard.
- Navigation filtering remains honest because it continues to use runtime product
  flags and workspace modules.
- New backend work is added only where a real workflow lacks a domain operation;
  presentation changes do not duplicate business rules in the browser.
