# Retention / نگهداری داده

سوئیپ داخلی برای پاک‌کردن داده‌های منقضی‌شده — بدون حذف متادیتای حیاتی.

## Dry-run (G12)

| مسیر | رفتار |
|------|--------|
| `GET /api/v1/system/retention/dry-run` | پیش‌نمایش شمارش (platform_owner / platform_support) — **بدون** پاکسازی |
| Platform admin UI | دکمه «اجرای dry-run» وقتی `providers.retention=dry_run_purge_v1` |

Capability: `dry_run_purge_v1` یعنی هم purge و هم preview موجود است.

## Job: `retention.purge`

| مسیر | رفتار |
|------|--------|
| `POST /api/v1/workspaces/:id/jobs` با `name: retention.purge` | enqueue (Redis) یا اجرای inline |
| Worker | `POST /api/v1/system/retention/purge` با internal job auth |
| Inline (بدون Redis) | `RetentionService.runPurge()` همان لحظه |

احراز داخلی: `INTERNAL_RETENTION_WORKSPACE_ID` / `INTERNAL_RETENTION_ACTOR_USER_ID` + `DANG_INTERNAL_JOB_TOKEN`.

## چه چیزی پاک می‌شود

1. **Statement export bodies** — `StatementsExportStore.purgeExpiredBodies()` وقتی `expires_at` گذشته (پیش‌فرض ۷ روز در ساخت export). در Postgres اگر نقش `dang_runtime` با FORCE RLS باشد شمارش ممکن است ۰ باشد و پاکسازی lazy در `get()` بماند؛ با `dang_migrator` (BYPASSRLS) UPDATE سراسری کار می‌کند.
2. **Attachment blobs قرنطینهٔ مسدود** — `purgeOldBlockedBlobs(90)`: فقط `storage_path` / `hasBlob` برای ردیف‌های `quarantine_status=blocked` قدیمی‌تر از ۹۰ روز؛ متادیتا نگه داشته می‌شود.

## چه چیزی عمداً پاک نمی‌شود

- ردیف‌های audit / security_event
- ledger / expense
- پیوست‌های clean یا pending

## زمان‌بندی

کرون خارجی یا enqueue دوره‌ای `retention.purge` از ops — محصول auto-cron ندارد مگر Redis worker + زمان‌بند شما.
