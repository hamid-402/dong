# SLO و Observability خارجی — مرحله ۱۰ / R10-01 برش پایه + برش ۲

| فیلد | مقدار |
|------|--------|
| وضعیت | برش پایه OTLP + **in-app SLO** (`providers.slo=in_app_v1`)؛ Grafana بیرونی همچنان خارج از محصول |
| تاریخ | ۱۴۰۵/۰۶/۲۲ |
| قانون | بدون داشبورد جعلی داخل محصول دنگ |

## ۱. اهداف SLO (مرجع)

همان اعداد [`QUALITY-AND-DELIVERY.md`](../QUALITY-AND-DELIVERY.md) §۷.

### In-app SLO (عمق D2 — بدون Grafana)

- `GET /api/v1/platform/slo` — فقط `platform_owner` / `platform_support` (سایرین ۴۰۴)
- UI: `/admin/slo` با gate روی `platformRole` + `providers.slo=in_app_v1`
- سیگنال‌ها از شمارندهٔ واقعی: outbox lag/failed، jobs DLQ، نرخ high/critical در security-events
- اگر Redis/outbox/sample نباشد → `available: false` و **بدون** burn جعلی

## ۲. مسیر طلایی برای trace

```text
HTTP (traceparent / x-request-id) → http.request
  → expense.createDraft | expense.post | health.ready | settlement.confirm
    → ledger.post*
      → ops.outbox_event (همان txn)
    → outbox.dispatch (notify)
  → jobs.enqueue → worker jobs.process (OTLP جدا اگر endpoint روی worker ست باشد)
```

Capabilities واقعی:

- `providers.tracing`: `off` | `local_spans` | `otlp`
- `providers.outbox` / `persistence.outbox`

## ۳. روشن‌کردن collector لوکال

```powershell
docker compose -f infra/compose.local.yml --profile observability up -d otel-collector
```

در `.env` (یا محیط API/worker):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SERVICE_NAME=dang-api
```

ری‌استارت `pnpm dev:api` (و در صورت نیاز worker). Spanها در لاگ containerِ `otel-collector` با exporter `debug` دیده می‌شوند.

Exporter داخل `@dang/observability` spanها را **batch** می‌کند و روی shutdown `flush` می‌کند. بدون endpoint، `providers.tracing` برابر `local_spans` (یا `off` با `DANG_TRACING=off`) می‌ماند — هیچ claim «otel live» جعلی نیست.

خاموش:

```powershell
docker compose -f infra/compose.local.yml --profile observability down
```

و `OTEL_EXPORTER_OTLP_ENDPOINT` را خالی کنید تا `providers.tracing` به `local_spans` برگردد.

## ۴. Grafana / Tempo

داشبورد محصولی داخل `apps/web` اضافه **نمی‌شود**. برای Grafana محلی، collector را به Tempo/Prometheus وصل کنید و پنل را بیرون از ریپو نگه دارید — یا بعداً با profile جدا و datasource واقعی گسترش دهید.

## ۵. Runbook کوتاه

| علامت | اقدام |
|--------|--------|
| `providers.tracing=otlp` ولی collector down | لاگ API هشدار OTLP export؛ مسیر کسب‌وکار قطع نمی‌شود |
| outbox `attempts` بالا | `ops.outbox_event` را برای `processed_at IS NULL` ببینید؛ notify/relay |
| job بدون traceId | enqueue باید از ALS پر شود؛ worker با `runWithRequestContext` ادامه می‌دهد |
