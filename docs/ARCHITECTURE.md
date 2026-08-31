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

## 3. ساختار هدف Monorepo

```text
apps/
  web/
  api/
  worker/
packages/
  workspaces/
  expenses/
  procurement/
  assets/
  partnerships/
  accounting/
  payments/
  documents/
  notifications/
  audit/
  reporting/
  db/
  contracts/
  ui/
  config/
  observability/
  testing/
infra/
docs/
```

## 4. ساختار هر Bounded Context

```text
src/
  domain/
    entities/
    value-objects/
    policies/
    events/
    errors/
  application/
    commands/
    queries/
    handlers/
    ports/
  infrastructure/
    persistence/
    messaging/
    adapters/
  presentation/
    http/
    schemas/
  public-api.ts
```

جهت وابستگی:

```text
presentation → application → domain
infrastructure → application ports + domain
domain → هیچ Framework یا Database Package
```

## 5. قوانین یکپارچگی کد

- Import داخلی Context دیگر ممنوع؛ فقط `public-api.ts`.
- Repository یا Table ماژول دیگر قابل استفاده مستقیم نیست.
- ارتباط Async با Domain Event و Transactional Outbox.
- API/Worker فقط Composition Root هستند.
- DTO، Domain Entity و DB Record جدا هستند.
- Controller نازک و بدون Query مستقیم.
- Generic CRUD Repository ممنوع؛ Repository بر اساس Use Case است.
- TypeScript strict و `any` در مرز مالی/امنیتی ممنوع.
- Naming کد و DB انگلیسی؛ ترجمه فقط UI.

مرزها با ESLint `no-restricted-imports` یا Dependency Cruiser در CI کنترل می‌شوند.

## 6. Frontend

- Next.js فقط Presentation و BFF محدود احراز هویت است.
- قواعد مالی و Transaction در Server Action قرار نمی‌گیرند.
- TanStack Query منبع Server State.
- React Hook Form + Zod برای فرم.
- OpenAPI Client تولیدشده؛ `fetch` پراکنده ممنوع.
- URL منبع Tab، Filter و Pagination قابل اشتراک.
- Local State فقط برای UI گذرا.
- عملیات مالی حساس Optimistic Update ندارد.

ساختار:

```text
apps/web/src/
  app/
  features/
  entities/
  shared/
    api/
    auth/
    i18n/
    ui/
    validation/
  service-worker/
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
