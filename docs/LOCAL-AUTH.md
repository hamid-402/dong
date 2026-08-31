# احراز هویت محلی (تا پیاده‌سازی OIDC)

تا قبل از اتصال Keycloak/OIDC، API در محیط development با هدرهای قابل اعتماد
Actor می‌سازد. این مسیر فقط وقتی `ALLOW_DEV_AUTH=true` باشد (پیش‌فرض development)
فعال است و در production باید خاموش بماند.

## هدرها

| هدر | الزام | توضیح |
|---|---|---|
| `x-dang-subject` | خیر | شناسه خارجی؛ پیش‌فرض `dev-local-user` |
| `x-dang-display-name` | خیر | نام نمایشی |
| `x-dang-user-id` | خیر | UUID ثابت برای تکرارپذیری تست |

## نمونه

```bash
curl -s http://localhost:3006/api/v1/auth/me ^
  -H "x-dang-subject: hamid-dev" ^
  -H "x-dang-display-name: حمید"

curl -s http://localhost:3006/api/v1/workspaces ^
  -H "Content-Type: application/json" ^
  -H "x-dang-subject: hamid-dev" ^
  -H "x-dang-display-name: حمید" ^
  -d "{\"name\":\"پروژه ویلا\",\"slug\":\"villa-partners\",\"template\":\"project_partners\"}"
```

## وضعیت Persistence

اگر `DATABASE_URL` تنظیم شده باشد، API از PostgreSQL + RLS استفاده می‌کند؛ در غیر این
صورت Workspace و Membership در حافظه Process نگه داشته می‌شوند.
