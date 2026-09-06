# فاز ۲ — Redis و آمادگی عملیاتی

## رفتار Idempotency با Redis

- بدون Redis: همان Map در‌حافظه + Promise مشترک برای درخواست‌های هم‌زمان.
- با Redis: کلید `idem:…` با مقدار `PENDING` (SET NX، TTL ۳۰ث) سپس نتیجهٔ JSON (TTL ۲۴س).
- اگر درخواست دیگری همان کلید را در حال پردازش ببیند → **HTTP 409** با
  `type: https://dang.local/problems/idempotency-in-flight`.
- کلاینت باید کوتاه صبر کند و با همان `idempotencyKey` دوباره بزند (نتیجهٔ کش‌شده برمی‌گردد).

## Rate limit

- لاگین / forgot-password: sliding window روی Redis (Lua) وقتی `REDIS_URL` تنظیم است؛ وگرنه in-memory.
- خطای Redis → fail-open (اجازه) تا قطع Redis همه را قفل نکند.

## Health

- `GET /health/live` — فقط زنده بودن process.
- `GET /health/ready` — ping واقعی Postgres (`select 1`) و Redis (`PING`) وقتی پیکربندی شده‌اند.
- `DANG_REQUIRE_POSTGRES=1` / `DANG_REQUIRE_REDIS=1` → در صورت fail، ۵۰۳.

## Worker

- روی `SIGTERM`/`SIGINT` حلقه BLPOP متوقف می‌شود؛ job در حال اجرا تا پایان ادامه می‌یابد.
- مصرف‌کننده: تا **۳ تلاش** با backoff؛ در صورت شکست نهایی → RPUSH به DLQ.

## Dead-letter queue (پیاده‌سازی‌شده)

کلید: `dang:jobs:dlq:v1` (`DANG_JOB_DLQ_KEY` در `@dang/contracts`).

الگوی runtime:

1. Worker پس از اتمام retries، `buildDeadLetterJob` را می‌سازد و RPUSH می‌کند:
   `{ job, error, attempts, failedAt }`
2. API (owner/admin، AuthGuard):
   - `GET /workspaces/:workspaceId/jobs/dlq` — `length` + `items`
   - `POST /workspaces/:workspaceId/jobs/dlq/replay` — RPOP از DLQ، سپس LPUSH job به `dang:jobs:v1`
3. بدون Redis → ۵۰۳ با problem type `redis-unavailable` (نه دادهٔ جعلی).

تست شکل payload بدون Redis: `packages/contracts/tests/jobs-dlq.test.ts` و
`apps/worker/src/jobs/consumer-dlq.test.ts`.
