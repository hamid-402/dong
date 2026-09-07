# دنگ همکاری

دفتر عملیات مشترک برای مدیریت هزینه، نیاز، خرید، تجهیزات، حساب شرکا و تسویه.

## اجرای محلی کامل (وب + API + Postgres)

پیش‌نیاز: Node.js 24+، pnpm، PostgreSQL. با `infra/compose.local.yml` پورت میزبان `5435` است؛ نصب محلی ویندوز معمولاً `5432`.

```powershell
pnpm install
# .env از روی .env.example ساخته شده و DATABASE_URL به دیتابیس dang اشاره می‌کند
pnpm db:migrate
pnpm dev:api    # http://localhost:3006
pnpm dev:web    # http://localhost:3005
```

سپس `http://localhost:3005` را باز کنید. دادهٔ نمونه (دمو) خودکار ساخته نمی‌شود — فقط با اقدام صریح کاربر (دکمهٔ برچسب‌دار «دمو» در UI یا `POST /api/v1/demo/seed`) و وقتی `ALLOW_DEV_AUTH=true` (و غیر production) فعال باشد.

- خانه: داشبورد زنده (مانده، هزینه، نیاز)
- مالی: `/workspaces`
- خرید: `/workspaces/procurement`
- تجهیزات: `/workspaces/assets`
- شرکا: `/workspaces/partnership`
- Health: `http://localhost:3006/api/v1/health`
- Capabilities: `http://localhost:3006/api/v1/system/capabilities`
- Demo seed (صریح + برچسب دمو + `ALLOW_DEV_AUTH`): `POST /api/v1/demo/seed`

## کنترل کیفیت

```bash
pnpm check
pnpm test
```

## اسناد مرجع

1. [تجمیع دنگ ۲.۰ با سامانه فعلی](docs/DONG-2.0-RECONCILIATION.md) — **منبع حقیقت اجرا**
2. [موجودی پایان Wave F — Live در برابر Infra](docs/DONG-2.0-FINISH.md)
3. [محصول و معماری ۲.۰](docs/DONG-2.0-PRODUCT.md)
4. [نقشه راه و حاکمیت ۲.۰](docs/DONG-2.0-ROADMAP.md)
5. [وضعیت اجرا](docs/STATUS.md)
6. [PostgreSQL محلی](docs/LOCAL-DATABASE.md)
7. [احراز هویت Dev](docs/LOCAL-AUTH.md)
8. [Runbook](docs/RUNBOOK.md)
9. [نقشه فازبندی](docs/ROADMAP.md)

## اصول غیرقابل مذاکره

- یک محصول و یک هسته داده با چهار قالب فضای کاری
- Modular Monolith پیش از Microservice
- دفترکل دوبل، مبلغ صحیح ریالی و اسناد نهایی تغییرناپذیر
- جداسازی tenant با کنترل برنامه و PostgreSQL RLS
- عدم نگهداری پول کاربران یا اطلاعات خام کارت
- RTL، دسترس‌پذیری و Mobile-first از روز اول
