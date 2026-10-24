# RLS برای جدول‌های social

> اعمال‌شده در migration `0092_social_rls` (اجرای ۲). سند دیگر «پیشنهادِ اعمال‌نشده» نیست.

## متغیر session واقعی API

API برای RLS از GUCهای PostgreSQL استفاده می‌کند که قبل از query ست می‌شوند:

| GUC | تابع کمکی | منبع کد |
|-----|-----------|---------|
| `app.user_id` | `app.current_user_id()` (migration `0001_tenant_rls.sql`) | `packages/db/src/client.ts` → `tenantContextQuery({ userId, workspaceId })` با `set_config('app.user_id', …, true)` |
| `app.workspace_id` | `app.current_workspace_id()` | همان `tenantContextQuery` |
| `app.internal_job` | — | jobهای داخلی (مثلاً `wave-f-settings.service.ts`) |

جدول‌های social **user-scoped**اند (نه workspace). `PostgresSocialStore` هر عملیات را داخل `withTenantContext({ userId })` اجرا می‌کند.

## جداول و policyها

- `social.user_directory_setting` — `user_directory_setting_self` (FOR ALL، صاحب ردیف)
- `social.friendship` — `friendship_party_all` (طرفین جفت)
- `social.contact_sync_run` — `contact_sync_run_self` (صاحب اجرا)

همه با `ENABLE` + `FORCE ROW LEVEL SECURITY`.

## تست ایزوله‌سازی

`packages/db/tests/social-rls-isolation.test.ts`:

1. کاربر B نمی‌تواند settings / contact_sync کاربر A را ببیند یا تغییر دهد.
2. دوستی A–B برای A و B دیده می‌شود؛ کاربر C نه.
3. بدون `app.user_id` تحت FORCE هیچ ردیفی دیده نمی‌شود.
