# نقشه اجرای فازبه‌فاز

این زمان‌ها برآورد برای تیم ۳ تا ۴ نفره باتجربه‌اند، نه تعهد زمانی. عبور از هر فاز
به معیار خروج وابسته است.

## فاز صفر — کشف، تثبیت و Foundation Design

بازه تقریبی: هفته ۱ تا ۲

### خروجی

- PRD و Scope
- چهار قالب Workspace و واژگان
- IA، User Flow، Wireframe و Prototype
- Design Tokens و Component Inventory
- Domain Map و Data Model نسخه صفر
- ADR-001 تا ADR-018
- Threat Model و Data Classification
- Test Strategy، SLO و Runbook Skeleton
- Backlog بر اساس Vertical Slice

### معیار خروج

- تست Prototype با ۵ تا ۷ نفر از هر قالب
- First-click مسیرهای اصلی حداقل ۸۵٪
- فهم بدهی حداقل ۹۰٪
- تصمیم‌های معماری Reviewed
- Scope MVP بدون ابهام

## فاز یک — Engineering Foundation

بازه تقریبی: هفته ۳ تا ۴

### خروجی

- Monorepo و Boundary Rule
- Next.js Web، API و Worker Skeleton
- CI، Lint، Typecheck، Test و Build
- OIDC و Session
- Workspace/Membership
- PostgreSQL، Drizzle و Migration
- Tenant Context و RLS
- Design System Foundation و Storybook
- OpenTelemetry و Staging Deploy

### معیار خروج

- Cross-tenant Test سبز
- Deploy خودکار Staging
- Restore اولیه موفق
- Componentهای پایه Light/Dark و RTL
- بدون Secret در Repository

## فاز دو — Vertical Slice مالی

بازه تقریبی: هفته ۵ تا ۸

مسیر:

```text
دعوت عضو → ثبت خرج → تقسیم → دفترکل → مانده → تسویه → تأیید
```

### خروجی

- ثبت خرج دو مرحله‌ای
- تقسیم مساوی، مبلغی، درصدی و سهمی
- چند پرداخت‌کننده
- دفترکل دوبل
- مانده و منشأ محاسبه
- تسویه ادعاشده/تأییدشده
- رسید، Comment، Audit و Notification

### معیار خروج

- Zero-sum و Rebuild Projection
- Idempotency و Concurrent Test
- ثبت خرج کاربر بازگشتی کمتر از ۶۰ ثانیه
- مانده اشتباه صفر
- Reconciliation سبز

## فاز سه — نیاز، خرید و تجهیزات

بازه تقریبی: هفته ۹ تا ۱۲

### خروجی

- Budget و Commitment
- Need و Purchase Request
- Approval یک‌مرحله‌ای و سقف مبلغ
- Vendor و خرید
- تحویل کامل/جزئی و مغایرت
- تبدیل قلم ماندگار به Asset
- Assignment، Transfer، Return و Damage

### معیار خروج

- چرخه کامل Request تا Delivery
- Maker-checker
- Role Matrix و Object-level Authorization
- تجهیزات دارای Owner، Location و Custodian

## فاز چهار — شراکت و گزارش

بازه تقریبی: هفته ۱۳ تا ۱۵

### خروجی

- Agreement Version
- آورده نقدی و غیرنقدی
- قرض شریک
- برداشت
- Ownership Share
- گزارش حساب شخص/پروژه
- PDF/Excel Export

### معیار خروج

- هزینه، آورده و قرض مخلوط نمی‌شوند.
- Scenario Test با Finance Domain Owner
- Export قابل تطبیق با Ledger
- قفل دوره و Reversal

## فاز پنج — Hardening و Beta

بازه تقریبی: هفته ۱۶ تا ۱۸

### خروجی

- PWA و Draft آفلاین
- Performance و Accessibility
- File Quarantine و OCR Benchmark
- Payment Link/Provider Adapter بدون Custody
- DAST و Penetration Test
- Backup/Restore و DR Drill
- Pilot با گروه‌های واقعی

### معیار Production

- همه Mustها اجرا یا استثنای زمان‌دار دارند.
- ASVS L2 Evidence
- تست نفوذ بدون Critical/High
- Restore و Rollback موفق
- SLO، On-call و Runbook فعال
- تأیید Legal/Privacy/PSP

## ترتیب توسعه هر قابلیت

هر قابلیت یک Slice کامل است:

1. Problem و Acceptance
2. UX Stateها
3. Threat و Data Classification
4. Domain Model و Policy
5. API Contract
6. Migration و RLS
7. UI و Accessibility
8. Audit و Observability
9. Test
10. Rollout و Measurement

هیچ قابلیت فقط با UI یا فقط با Table «تمام‌شده» محسوب نمی‌شود.

## گیت‌های بازار

- ۳۰ مصاحبه مبتنی بر شواهد واقعی
- ۱۲ پایلوت Concierge
- ۸ گروه فعال تا هفته دوم
- ۶ گروه بازگشتی در هفته چهارم
- ۴ پیش‌پرداخت واقعی

اگر پس از ۲۰ پایلوت نگهداشت هفته چهارم زیر ۳۰٪ یا پرداخت واقعی زیر ۱۵٪ باشد،
Vertical یا Value Proposition بازتعریف می‌شود.
