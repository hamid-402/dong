# OIDC (Authorization Code + PKCE)

مسیر: Authorization Code + PKCE با Session در Cookie امن HttpOnly.
Membership و Capability در دیتابیس برنامه نگه داشته می‌شود، نه در Token بزرگ.

## وضعیت فعلی

- `GET /api/v1/auth/oidc/status` — وضعیت پیکربندی (بدون Secret)
- `GET /api/v1/auth/oidc/login` — redirect به Issuer با PKCE
- `GET /api/v1/auth/oidc/callback` — تبادل code، ایجاد session، redirect به Web
- Web: دکمه «ورود با SSO» در `/login`؛ بعد از callback → `/hub?login=ok` و ست شدن `dang_web_session`
- Dev Auth با `ALLOW_DEV_AUTH` برای توسعه محلی (هدرهای `x-dang-*`)

## متغیرها

```text
OIDC_ISSUER_URL=https://your-idp.example.com
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
SESSION_SECRET=change-me-in-production
ALLOW_DEV_AUTH=true
API_BASE_URL=http://localhost:3006/api/v1
WEB_ORIGIN=http://localhost:3005
```

در Production باید `ALLOW_DEV_AUTH=false` باشد و Issuer/Client/SESSION_SECRET واقعی تنظیم شود.

## جریان

1. Web → `GET /api/v1/auth/oidc/login` (API redirect به IdP)
2. IdP → `GET /api/v1/auth/oidc/callback?code=...&state=...`
3. API: verify state، exchange token، map `sub` → `user_account.external_subject`، کوکی `dang_session`
4. Redirect → `{WEB_ORIGIN}/hub?login=ok`
5. Hub: `markClientSession("oidc")` → کوکی `dang_web_session` برای middleware

## گام‌های بعدی (اختیاری)

- Refresh token / session rotation
- Logout از IdP (RP-initiated)
- اتصال Mailer واقعی برای ایمیل‌های auth
