# پیشنهاد RLS برای جدول‌های social

> **پیشنهاد — نیازمند بازبینی CTO، اعمال نشده.**  
> Migration / policy روی DB اجرا نشده است. این سند فقط متن پیشنهادی است.

## متغیر session واقعی API

API برای RLS از GUCهای PostgreSQL استفاده می‌کند که قبل از query ست می‌شوند:

| GUC | تابع کمکی | منبع کد |
|-----|-----------|---------|
| `app.user_id` | `app.current_user_id()` (migration `0001_tenant_rls.sql`) | `packages/db/src/client.ts` → `tenantContextQuery({ userId, workspaceId })` با `set_config('app.user_id', …, true)` |
| `app.workspace_id` | `app.current_workspace_id()` | همان `tenantContextQuery` |
| `app.internal_job` | — | jobهای داخلی (مثلاً `wave-f-settings.service.ts`) |

جدول‌های social **user-scoped**اند (نه workspace). قبل از هر query social روی Postgres، اتصال باید `app.user_id` را برای کاربر احرازشده ست کند. امروز `PostgresSocialStore` مستقیماً `set_config` نمی‌زند؛ قبل از اعمال RLS باید مسیر social هم از `tenantContextQuery` (یا معادل) استفاده کند.

## جداول هدف

- `social.user_directory_setting` — PK = `user_id`
- `social.friendship` — `requester_user_id` / `addressee_user_id`
- `social.contact_sync_run` — `user_id`

## متن پیشنهادی SQL (اعمال نشده)

```sql
-- پیشنهاد — نیازمند بازبینی CTO، اعمال نشده

-- user_directory_setting: فقط صاحب ردیف
ALTER TABLE "social"."user_directory_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social"."user_directory_setting" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'social'
      AND tablename = 'user_directory_setting'
      AND policyname = 'user_directory_setting_self'
  ) THEN
    CREATE POLICY "user_directory_setting_self"
      ON "social"."user_directory_setting"
      FOR ALL
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"());
  END IF;
END $$;

-- friendship: هر طرف جفت می‌تواند ببیند/تغییر دهد
ALTER TABLE "social"."friendship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social"."friendship" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'social'
      AND tablename = 'friendship'
      AND policyname = 'friendship_party_all'
  ) THEN
    CREATE POLICY "friendship_party_all"
      ON "social"."friendship"
      FOR ALL
      USING (
        "requester_user_id" = "app"."current_user_id"()
        OR "addressee_user_id" = "app"."current_user_id"()
      )
      WITH CHECK (
        "requester_user_id" = "app"."current_user_id"()
        OR "addressee_user_id" = "app"."current_user_id"()
      );
  END IF;
END $$;

-- contact_sync_run: فقط صاحب اجرا
ALTER TABLE "social"."contact_sync_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social"."contact_sync_run" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'social'
      AND tablename = 'contact_sync_run'
      AND policyname = 'contact_sync_run_self'
  ) THEN
    CREATE POLICY "contact_sync_run_self"
      ON "social"."contact_sync_run"
      FOR ALL
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"());
  END IF;
END $$;
```

Guard با `NOT EXISTS` روی `pg_policies` برای idempotency (هم‌سبک migrationهای پوششی موجود).

## طرح تست ایزوله‌سازی دوکاربره (پس از اعمال)

1. دو کاربر A و B با UUID جدا؛ در دو تراکنش جدا `set_config('app.user_id', A|B, true)`.
2. A یک `user_directory_setting` و یک `contact_sync_run` می‌سازد → با session B، `SELECT` باید ۰ ردیف برگرداند؛ `UPDATE`/`DELETE` روی ردیف A باید ۰ باشد.
3. A درخواست دوستی به B می‌فرستد (`friendship`) → با session A و session B هر دو ردیف را می‌بینند؛ کاربر C نباید ببیند/تغییر دهد.
4. بدون `app.user_id` (خالی) تحت `FORCE ROW LEVEL SECURITY` باید هیچ ردیفی دیده نشود.

## پیش‌نیاز کد قبل از migration

- `PostgresSocialStore` باید در هر عملیات `tenantContextQuery({ userId })` (یا `set_config('app.user_id', …)`) را روی همان connection/transaction اجرا کند.
- نقش runtime DB نباید `BYPASSRLS` باشد.

## صریح

**پیشنهاد — نیازمند بازبینی CTO، اعمال نشده.** فاز ۳ فقط این سند را اضافه می‌کند؛ migration `0092` برای social RLS نوشته نشده است.
