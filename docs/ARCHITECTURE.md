# معماری نرم‌افزار

## 1. تصمیم اصلی

TypeScript end-to-end در یک Monorepo و Modular Monolith با سه Process:

```text
Web      Next.js App Router / PWA
API      NestJS روی Fastify
Worker   NestJS Standalone برای Queue Consumer
```

منبع حقیقت PostgreSQL است. Redis/Valkey فقط Cache، Rate Limit و Queue است.
فایل‌ها در Object Storage خصوصی S3-compatible نگهداری می‌شوند.

## 2. چرا Modular Monolith؟

- تراکنش‌های مالی اتمیک باقی می‌مانند.
- عملیات، Deploy و Debug برای تیم کوچک ساده‌تر است.
- شکست شبکه و Distributed Transaction به هسته مالی اضافه نمی‌شود.
- مرزهای دامنه امکان استخراج Service در آینده را حفظ می‌کنند.

اولین کاندیداهای استخراج آینده OCR، Notification و Webhook Delivery هستند.
Accounting، Expense و Settlement آخرین گزینه‌های استخراج‌اند.

## 3. ساختار فعلی Monorepo (S10-17)

```text
apps/
  web/       Next.js App Router (`app/`, `components/`, `lib/`)
  api/       NestJS modular monolith (`src/<bounded-context>/`)
  worker/    Queue consumer (Redis)
packages/
  config/
  contracts/
  db/
  ui/
  observability/
infra/
docs/
```

دامنه‌ها (expense، settlement، ledger، iam، jobs، …) امروز به‌صورت ماژول Nest داخل `apps/api/src` هستند — نه پکیج جدا.
استخراج پکیج دامنهٔ جدا (expenses/ledger به packages) هدف برش ۲ همان **R10-11** است؛ مرز فعلی apps↔packages با `dependency-cruiser` در CI قفل شده (`.dependency-cruiser.cjs` · `pnpm depcruise`).

## 4. الگوی Bounded Context داخل API

هر پوشهٔ دامنه تقریباً این لایه‌ها را دارد (نه الزاماً همه):

```text
apps/api/src/<context>/
  *.controller.ts
  *.service.ts
  *.module.ts
  *-store.ts / memory-*.ts / postgres-*.ts
  *.types.ts
```

جهت وابستگی مطلوب:

```text
controller → service → store
contracts/db به‌عنوان قرارداد و persistence مشترک
```

## 5. قوانین یکپارچگی کد

- Import بین apps فقط از طریق `packages/*` مجاز است.
- Store یک دامنه نباید جدول دامنهٔ دیگر را مستقیم بنویسد مگر از طریق سرویس/قرارداد صریح.
- ارتباط Async با Queue (Redis) و Transactional Outbox (`ops.outbox_event` · R10-03 برش ۱).
- API/Worker Composition Root هستند.
- DTO (`@dang/contracts`)، رکورد DB (`@dang/db`) و منطق سرویس جدا می‌مانند.
- Controller نازک؛ validation با Zod.
- TypeScript strict؛ `any` در مرز مالی/امنیتی ممنوع.
- Naming کد و DB انگلیسی؛ ترجمه فقط UI.

مرز پکیج‌های apps↔packages با Dependency Cruiser در CI (**R10-11**) enforce می‌شود؛ استخراج Domain Packages جدا (`R10-11b`) پس از موتور سیاست مرکزی.

## 6. Frontend

- Next.js Presentation؛ منطق مالی در API.
- Client HTTP متمرکز در `apps/web/src/lib/api/*` (نه `fetch` پراکنده).
- URL منبع Tab/Filter قابل اشتراک (`/w/[slug]/…`).
- Local State برای UI گذرا؛ Server State از API.
- عملیات مالی حساس Optimistic Update ندارد.

ساختار فعلی:

```text
apps/web/src/
  app/            App Router + error/not-found/forbidden
  components/     shell، views، ui-blocks
  lib/            api، navigation، access، session
```

## 7. API

- REST/JSON و URI Versioning: `/api/v1`
- OpenAPI منبع قرارداد
- RFC Problem Details برای خطا
- Cursor Pagination
- `Idempotency-Key` برای Mutation حساس
- `If-Match`/Version برای Optimistic Concurrency
- عملیات طولانی: `202 Accepted` + Job Resource
- Webhook: Signature، Timestamp، Replay Window و Inbox Deduplication
- GraphQL در فاز نخست وجود ندارد.

## 8. Queue و Event

Queueها:

- OCR
- Notifications
- Webhooks
- Exports
- Projections
- Scheduled Reconciliation

Outbox در همان Transaction تغییر دامنه ثبت می‌شود. Workerها At-least-once هستند،
اما Consumer باید Idempotent باشد تا اثر کسب‌وکار دقیقاً یک بار رخ دهد.

## 9. Authentication و Authorization

- OIDC Authorization Code + PKCE
- Keycloak Self-host یا Provider مدیریت‌شده
- Session در Cookie امن HttpOnly
- Access Token کوتاه‌عمر
- Membership و Capability در DB برنامه، نه Token بزرگ
- MFA برای Owner، Admin و Finance
- Step-up برای Export، تغییر نقش، حساب بانکی و عملیات پرریسک
- RBAC پایه + ABAC بر اساس Workspace، Project، Amount و State

## 10. استقرار

```text
Edge/WAF/Reverse Proxy
  ├─ Web containers
  └─ API containers
Worker containers
PostgreSQL
Redis/Valkey
S3-compatible storage
OIDC Provider
OpenTelemetry Collector
```

- Local: Docker Compose
- CI: سرویس‌های Disposable
- Preview: بدون داده Production
- Staging: Topology مشابه Production با داده Synthetic
- Production: حداقل دو Web/API، Worker مستقل و Managed DB چندناحیه‌ای

Kubernetes در شروع الزام نیست. Container Platform مدیریت‌شده انتخاب پیش‌فرض است.

## 11. مسیر Scale

1. یک PostgreSQL و Processهای مستقل
2. Horizontal Web/API و Worker Autoscale
3. PgBouncer و Redis HA
4. Read Replica و Read Model برای گزارش
5. Partition فقط با Evidence
6. Database جدا برای Tenant بسیار بزرگ
7. استخراج OCR/Notification/Reporting در صورت نیاز
