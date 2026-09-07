# Performance & Core Web Vitals

How we measure and gate front-end performance for `@dang/web`. Nothing here fakes a
score — every number comes from a real Lighthouse run against a reachable URL.

## Budgets we already enforce in CI

- **Bundle size budget** — `pnpm bundle:check` (`scripts/check-bundle-budget.mjs`) measures
  built `.next/static` client assets against warn/fail thresholds.
- **Component line budget** — `pnpm views:line-budget` (`scripts/view-line-budget.mjs`)
  scopes **`apps/web/src/components/**`** (Law 5): warn >800 / fail >1600 lines per `.tsx` file.

## Running Lighthouse manually

Lighthouse needs a running server and a real Chrome. Locally:

```bash
# 1. Build and start the production server (SW registers only in production).
pnpm --filter @dang/web build
pnpm --filter @dang/web start   # serves http://127.0.0.1:3005

# 2. In another terminal, audit a public route (login is unauthenticated).
npx --yes lighthouse http://127.0.0.1:3005/login \
  --preset=desktop \
  --output=html --output=json \
  --output-path=./lighthouse-report \
  --chrome-flags="--headless --no-sandbox"
```

Open `lighthouse-report.report.html` for the full breakdown. Focus metrics:

| Metric | Target |
| --- | --- |
| Largest Contentful Paint (LCP) | < 2.5s |
| Cumulative Layout Shift (CLS) | < 0.1 |
| Total Blocking Time (TBT) | < 200ms |
| Performance score | ≥ 0.85 |

Authenticated surfaces require a session cookie (`dang_web_session=1`) plus
`localStorage["dang.auth.mode"]="dev"` — the same pattern used by the e2e specs in
`apps/web/e2e/`.

## Automated Lighthouse (opt-in, honest)

`.github/workflows/lighthouse.yml` runs on `workflow_dispatch` and on a weekly schedule.
It audits a URL that comes from either:

1. the `url` workflow input, or
2. the `LIGHTHOUSE_URL` repository secret.

If neither is set, the job emits a `::notice::` and **skips** the audit rather than
pretending to pass. When a URL *is* provided, the Lighthouse step is a real gate (no
`continue-on-error`) so a genuine regression fails the run.

## PWA / offline

Service worker: `apps/web/public/sw.js` (registered by `PwaRegister`, production only).
The offline app-shell behaviour is smoke-tested in `apps/web/e2e/pwa-offline.spec.ts`,
which verifies `/sw.js` and the web manifest are served and, when the SW is actually
controlling the page, that the cached shell survives going offline.
