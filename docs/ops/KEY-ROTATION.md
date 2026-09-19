# چرخش کلید (R10-06)

## حالت‌ها (`providers.secrets`)

| مقدار | معنی |
|-------|------|
| `env` | فقط کلیدهای process env |
| `env_with_rotation` | env + پنجرهٔ PREVIOUS |
| `local_vault_v1` | Local Key Vault داخل ریپو زنده است (حافظه یا `ops.vault_secret`) |

HashiCorp Vault / cloud KMS هنوز وصل نیست و ادعا نمی‌شود.

## Local Key Vault

1. Master: `DANG_MASTER_KEY` = base64 دقیقاً ۳۲ بایت. در non-prod بدون env، یک‌بار `.dang/master.key` ساخته می‌شود (هشدار لاگ؛ در gitignore).
2. محرمانه‌ها با AES-256-GCM؛ AAD = `name:version`؛ DEK تصادفی و wrap با master.
3. Admin: `GET/POST /api/v1/vault/*` و UI `/admin/vault` — فقط `platform_owner` (غیرمجاز → ۴۰۴).
4. `seal` حافظهٔ master را پاک می‌کند و `get` را قطع می‌کند؛ `unseal` دوباره از env/فایل می‌خواند.
5. چرخش secret نسخهٔ جدید می‌سازد و نسخهٔ قبلی قابل decrypt می‌ماند. چرخش master همهٔ DEKها را rewrap می‌کند.

## TOTP (`totp_secret`) — مسیر env (fallback)

1. کلید جدید را در `TOTP_ENCRYPTION_KEY` بگذارید؛ کلید قبلی را در `TOTP_ENCRYPTION_KEY_PREVIOUS`.
2. API را ریستارت کنید — enroll جدید با کلید جاری seal می‌شود؛ خواندن با هر دو کلید کار می‌کند.
3. پس از اطمینان، `TOTP_ENCRYPTION_KEY_PREVIOUS` را حذف کنید.
4. وقتی vault unsealed است، مادهٔ کلید از نام `totp_encryption_key` خوانده می‌شود.

## Internal job HMAC

1. توکن جدید: `DANG_INTERNAL_JOB_TOKEN` روی API و worker (و/یا secret `internal_job_hmac` در vault).
2. توکن قبلی: `DANG_INTERNAL_JOB_TOKEN_PREVIOUS` فقط روی API (پنجرهٔ verify) یا نسخهٔ قبلی vault.
3. Worker را به توکن جدید به‌روز کنید؛ سپس PREVIOUS را بردارید.

## نشست

کوکی نشست opaque + hash در DB است. فلفل `SESSION_SECRET` / vault `session_secret` برای TOTP-derive و phone-hash استفاده می‌شود.

## خارج از این برش

- HashiCorp Vault / cloud KMS provider
- reseal دسته‌ای خودکار همهٔ `totp_secret` ردیف‌های حساب
