# دنگ همکاری

دفتر عملیات مشترک برای مدیریت هزینه، نیاز، خرید، تجهیزات، حساب شرکا و تسویه.

## اجرای محلی کامل (وب + API + Postgres)

پیش‌نیاز: Node.js 24+، pnpm، PostgreSQL محلی روی `5432`.

```powershell
pnpm install
# .env از روی .env.example ساخته شده و DATABASE_URL به دیتابیس dang اشاره می‌کند
pnpm db:migrate
pnpm dev:api    # http://localhost:3006
pnpm dev:web    # http://localhost:3005
```

سپس `http://localhost:3005` را باز کنید. اگر فضای کاری خالی باشد، داشبورد خودکار «دادهٔ نمونه» می‌سازد.

- خانه: داشبورد زنده (مانده، هزینه، نیاز)
- مالی: `/workspaces`
- خرید: `/workspaces/procurement`
- تجهیزات: `/workspaces/assets`
- شرکا: `/workspaces/partnership`
- Health: `http://localhost:3006/api/v1/health`
- Capabilities: `http://localhost:3006/api/v1/system/capabilities`
- Demo seed: `POST /api/v1/demo/seed`

## کنترل کیفیت

```bash
pnpm check
pnpm test
```

## اسناد مرجع

1. [وضعیت اجرا](docs/STATUS.md)
2. [PostgreSQL محلی](docs/LOCAL-DATABASE.md)
3. [احراز هویت Dev](docs/LOCAL-AUTH.md)
4. [Runbook](docs/RUNBOOK.md)
5. [نقشه فازبندی](docs/ROADMAP.md)

## اصول غیرقابل مذاکره

- یک محصول و یک هسته داده با چهار قالب فضای کاری
- Modular Monolith پیش از Microservice
- دفترکل دوبل، مبلغ صحیح ریالی و اسناد نهایی تغییرناپذیر
- جداسازی tenant با کنترل برنامه و PostgreSQL RLS
- عدم نگهداری پول کاربران یا اطلاعات خام کارت
- RTL، دسترس‌پذیری و Mobile-first از روز اول
