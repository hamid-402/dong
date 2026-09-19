# Analytics warehouse (R10-20)

| فیلد | مقدار |
|------|--------|
| وضعیت | برش ۱ — schema جدا + ETL صریح + API فقط‌خواندنی |
| capabilities | `providers.analyticsWarehouse` ∈ `memory_etl` \| `postgres_etl` \| `postgres_replica_etl` |

## معماری این برش

```
OLTP expenses (posted)  --ETL-->  analytics.daily_spend_fact
                                      ^
GET /analytics/warehouse  ------------┘  (فقط خواندن factها)
POST /analytics/etl/run   --> اجرای ETL برای workspace
```

- جداسازی منطقی: schema `analytics` (مهاجرت `0042_analytics_warehouse.sql`) با RLS
- جداسازی فیزیکی اختیاری: `ANALYTICS_DATABASE_URL` ⇒ mode=`postgres_replica_etl`
- بدون URL جدا: همان Postgres، schema جدا ⇒ `postgres_etl` (صادقانه نه «replica ابری»)
- بدون DATABASE_URL: `memory_etl`

## API

| روش | مسیر | نقش |
|-----|------|-----|
| GET | `/workspaces/:id/analytics/warehouse` | owner/admin/finance/auditor |
| POST | `/workspaces/:id/analytics/etl/run` | همان |

Factها فقط از خرجهای `posted` غیر`private` با ارز IRR ساخته می‌شوند.

## UI

صفحهٔ متریک (`/w/[slug]/metrics`) بخش «انبار تحلیلی» را فقط وقتی `providers.analyticsWarehouse` از capabilities بیاید نشان می‌دهد — دکمهٔ ETL واقعی است.

صفحهٔ jobs (`/w/[slug]/jobs`) وقتی `providers.jobs=redis_queue` است، دکمهٔ **ETL analytics** برای owner/admin کار `analytics.etl` را به Redis صف می‌کند؛ worker با همان الگوی `recurrence.tick` (actor در meta) به `POST …/analytics/etl/run` می‌زند.

## Cron / worker

```bash
# مستقیم API (بعد از مهاجرت 0042)
curl -X POST -b 'dang_session=…' -H 'x-csrf-token: …' \
  "$API/workspaces/$WS/analytics/etl/run"

# یا از UI Jobs / enqueue نام analytics.etl وقتی Redis+worker زنده است
```

## خارج از برش

- انبار ستاره‌ای چند‌fact (ابعاد عضو، دسته، تسویه)
- dbt / Airflow / BigQuery
- streaming CDC
- UI داشبورد BI جدا
