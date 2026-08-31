# وضعیت اجرای پروژه

آخرین به‌روزرسانی: ۳۱ اوت ۲۰۲۶ — سامانه محلی end-to-end

## چرا قبلاً فقط «پوسته» دیده می‌شد؟

1. صفحهٔ `/` پیش‌نمایش بصری ثابت بود، نه داشبورد API.
2. `.env` و Migration روی Postgres اجرا نشده بود → storeها memory بودند.
3. ناوبری مشترک و seed دمو نبود.

## الان (لوکال)

| لایه | وضعیت |
|---|---|
| Postgres 18 + DB `dang` + migrate `0000`–`0010` | ✅ |
| `.env` با `DATABASE_URL` (gitignored) | ✅ |
| API `:3006` + Web `:3005` | ✅ |
| داشبورد زنده `/` + AppShell | ✅ |
| Demo seed `POST /api/v1/demo/seed` | ✅ |
| تجهیزات UI | ✅ `/workspaces/assets` |

Capabilities فعلی: همهٔ IAM / Audit / Ledger / Expense / Settlement / Partnership / Procurement → **postgres**.

Asset / Payment / Collab هنوز memory هستند (جدول schema آماده است).

## آدرس‌ها

- خانه: http://localhost:3005/
- مالی: http://localhost:3005/workspaces
- خرید: http://localhost:3005/workspaces/procurement
- تجهیزات: http://localhost:3005/workspaces/assets
- شرکا: http://localhost:3005/workspaces/partnership
- Health: http://localhost:3006/api/v1/health
