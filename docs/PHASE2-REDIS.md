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

## Dead-letter (فاز ۵ — اسکیل)

الگوی پیشنهادی وقتی worker fail می‌کند بعد از N تلاش:

1. RPUSH به `dang:jobs:dlq:v1` با `{ job, error, attempts, failedAt }`
2. متریک/آلارم روی طول DLQ
3. ابزار replay دستی برای اپراتور

فعلاً jobهای ناموفق فقط لاگ می‌شوند؛ DLQ قبل از ترافیک بالا اضافه شود.
