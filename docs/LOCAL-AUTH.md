# احراز هویت محلی و پروفایل

دنگ سه مسیر هویت دارد:

1. **ایمیل/رمز + کوکی نشست** (استاندارد محصول)
2. **DevAuth** با هدرهای `x-dang-*` وقتی `ALLOW_DEV_AUTH=true` و `NODE_ENV !== production` (فقط توسعه)
3. **OIDC** با PKCE + همان کوکی نشست (پیکربندی‌شده؛ جزئیات در `LOCAL-OIDC.md`)

## مسیرهای API

| مسیر | توضیح |
|---|---|
| `POST /auth/register` | ثبت‌نام؛ کوکی `dang_session` |
| `POST /auth/login` | ورود (rate-limit) |
| `POST /auth/logout` | ابطال نشست |
| `POST /auth/forgot-password` | درخواست بازیابی (ضد enumeration، rate-limit) |
| `POST /auth/reset-password` | تنظیم رمز با توکن یک‌بارمصرف |
| `GET/PATCH /auth/profile` | پروفایل شخصی |
| `POST /auth/change-password` | تغییر رمز + ابطال همه نشست‌ها |
| `POST /auth/revoke-sessions` | ابطال همه نشست‌ها (همه دستگاه‌ها) |
| `GET /auth/session` | خلاصه نشست فعلی |
| `GET /auth/me` | Actor + فضاهای کاری |

رمز با **Argon2id** هش می‌شود؛ هش‌های قدیمی scrypt در لاگین موفق ارتقا می‌یابند. توکن نشست و بازیابی فقط به‌صورت SHA-256 در DB ذخیره می‌شوند.

## صفحات وب

- `/login` `/register` `/forgot-password` `/reset-password` `/profile`
- در حالت توسعه، `forgot-password` ممکن است `debugResetUrl` برگرداند (بدون ایمیل واقعی).

## DevAuth (قدیمی)

| هدر | الزام | توضیح |
|---|---|---|
| `x-dang-subject` | خیر | شناسه خارجی؛ پیش‌فرض `dev-local-user` |
| `x-dang-display-name` | خیر | نام نمایشی |
| `x-dang-user-id` | خیر | UUID ثابت برای تکرارپذیری تست |

Guard اول کوکی نشست را می‌خواند؛ اگر نبود و `ALLOW_DEV_AUTH` فعال بود، به هدرها برمی‌گردد.

## Migration

```powershell
$env:DATABASE_URL="postgresql://dang_migrator:<PASSWORD>@127.0.0.1:5432/dang"
pnpm --filter @dang/db db:migrate
```

شامل `0013_local_auth_profile` (فیلدهای پروفایل، `auth_session`، `auth_password_reset`).

`SESSION_SECRET` را در production تنظیم کنید.
