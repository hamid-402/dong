# OIDC (اسکلت)

مسیر نهایی: Authorization Code + PKCE با Session در Cookie امن HttpOnly.
Membership و Capability در دیتابیس برنامه نگه داشته می‌شود، نه در Token بزرگ.

## وضعیت فعلی

- `GET /api/v1/auth/oidc/status` فقط وضعیت پیکربندی را برمی‌گرداند (بدون Secret).
- Dev Auth با `ALLOW_DEV_AUTH` برای توسعه محلی فعال است.
- Callback، Cookie Session و PKCE هنوز پیاده نشده‌اند.

## متغیرها

```text
OIDC_ISSUER_URL=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
ALLOW_DEV_AUTH=true
```

در Production باید `ALLOW_DEV_AUTH=false` باشد و Issuer/Client واقعی تنظیم شود.

## گام بعدی پیاده‌سازی

1. Discovery از Issuer (`.well-known/openid-configuration`)
2. شروع Login از Web با PKCE
3. Callback در API و ایجاد Session Cookie
4. Map `sub` به `iam.user_account.external_subject`
5. غیرفعال‌سازی هدرهای Dev در Staging/Production
