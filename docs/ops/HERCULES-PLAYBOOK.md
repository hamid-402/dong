# Hercules playbook — بستن گام‌های G01–G16 + عمق

چک‌لیست شواهد. ادعای شفاهی کافی نیست.

## قوانین

1. فقط additive
2. بدون داده جعلی — UI از capabilities / API
3. contracts (+db) + API + web + تست + capability صادق

## G12 پلتفرم

| پیشنهاد | شاهد عمق |
|---------|----------|
| #53 Retention | `RetentionService.previewPurge` · `GET system/retention/dry-run` · RBAC platform · UI platform-admin · `retention.dry-run.test.ts` + `retention.controller.test.ts` |
| #54 SaaS | store + `SaasBillingService.usage` تست عمق (seats/expenses واقعی) · UI `WorkspacePlanPanel` gated · پرداخت فقط PSP live |
| #57 SLO | `computePlatformSlo` از outbox/DLQ · UI `/admin/slo` · `slo.test.ts` |
| #58 Webhooks | HMAC contracts · `WebhooksService` · **Postgres store + migration 0081 + RLS** · `createPersistenceStore` · RBAC owner/admin/finance برای create/deactivate · fan-out از outbox |
| #59 FX provider | `FX_PROVIDER_URL` → `http_v1` · sync endpoint · `conversionLive` همیشه false |

## G13 FX preview

| مورد | شاهد |
|------|------|
| Preview | `buildFxConvertPreviewResult` · `live: false` اجباری · تست depth |
| صداقت | `fxPreview=preview_v1` فقط وقتی `DATABASE_URL` (جدول نرخ) · وگرنه `none` |
| UI | `FxRatesPanel` با `fxPreview` یا `ENABLE_FX_RATES` · نوشتن فقط با flag |

## G14 charts / مسیر فرعی

| مورد | شاهد |
|------|------|
| Charts | CHART_RANGE · analytics facts · plan Forbidden · monthly_close · mergeSum |
| UI | `planDenied` بدون نمودار جعلی · personal off-state |
| E2E | `kind-reports-smoke` + procurement gate در stage10 |

## G15 + hardening عمق

| مورد | شاهد |
|------|------|
| Webhook Postgres | `0081_workspace_webhooks.sql` · `PostgresWorkspaceWebhookStore` · `persistence.webhooks` واقعی |
| RBAC | member نمی‌تواند create · تست `forbidden for plain member` |
| Outbox+HMAC | تست relay با `WebhooksService` واقعی + verify signature |
| Procurement | `ProcurementService` قیمت فریز + link idempotent |
| Off-state | استهلاک / قیمت توافقی با StatusLine صادق |
| SaaS usage | تست سرویس با seats/expenses واقعی |

## G16 polish مالی شخصی + گزارش حوزه (G06/G07 residual)

| مورد | شاهد |
|------|------|
| Hub ↔ space | `/me/finance` همیشه charts+resources+goals؛ deep-link `#overview/#goals/#charts/#resources` |
| Hash scroll | `usePersonalFinanceHashScroll` + vitest |
| goalsLive | `PersonalDepthPanel` gated روی `providers.savingsGoals === goals_v1` + StatusLine off-state |
| CSV بدون charts | `kindBalanceRowsToCsv` · export balances وقتی charts خاموش · تست chart-insights |

## دستور تست عمق

```powershell
Set-Location packages/contracts; npm run build
Set-Location ../db; npm run build
Set-Location ../../apps/api
npx tsx --test `
  src/webhooks/webhooks.service.test.ts `
  src/webhooks/webhook-migration.invariants.test.ts `
  src/fx-rates/fx-rates.preview.test.ts `
  src/outbox/outbox.memory.test.ts `
  src/saas-billing/saas-billing.test.ts `
  src/procurement/procurement.service.test.ts `
  src/retention/retention.dry-run.test.ts `
  src/retention/retention.controller.test.ts `
  src/charts/charts.test.ts
Set-Location ../web
npx vitest run src/lib/use-personal-finance-hash-scroll.test.ts src/lib/chart-insights.test.ts
```

## محدودیت‌های صادق (عمدی / باقی‌ماندهٔ polish)

- `conversionLive` عمداً false تا موتور حسابداری
- e2e Playwright برای plan_required charts هنوز smoke است نه matrix پلن
- SLO capability همیشه `in_app_v1` وقتی ماژول لود است (سرویس واقعاً gauge می‌خواند)
