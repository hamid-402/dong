# بار و soak با k6 (R10-09)

| فیلد | مقدار |
|------|--------|
| وضعیت | اسکلت golden-path + workflow on-demand |
| قانون | بدون badge/SLO جعلی در UI محصول |

## مسیر طلایی این برش

خواندن‌های عمومی (بدون نشست):

1. `GET /api/v1/health/live`
2. `GET /api/v1/health/ready`
3. `GET /api/v1/system/capabilities`
4. `GET /login` (web)

مسیر مالی authenticated (خرج→ledger) برای soak شبانه هنوز خارج از برش است — نیاز به fixture امن staging.

## اجرای محلی

پیش‌نیاز: [k6](https://k6.io/docs/get-started/installation/) یا Docker.

```bash
# API :3006 و Web :3005 بالا باشند
pnpm perf:k6

# یا
k6 run -e API_BASE=http://127.0.0.1:3006 -e WEB_BASE=http://127.0.0.1:3005 perf/k6/golden-path.js

docker run --rm -i --network host grafana/k6:0.54.0 run - <perf/k6/golden-path.js
```

بودجهٔ این اسکریپت (smoke): `http_req_failed < 5%` · `ready p95 < 800ms` · `http p95 < 1500ms`.  
اعداد aspirational محصول در `docs/QUALITY-AND-DELIVERY.md` §۷ هستند و تا scrape واقعی نباید در UI نشان داده شوند.

## CI

Workflow: [`.github/workflows/load-k6.yml`](../../.github/workflows/load-k6.yml)

- `workflow_dispatch` با `api_base` / `web_base`
- اگر secret `K6_API_BASE` خالی و input خالی → skip صادق
- soak شبانهٔ طولانی: خارج از این برش (زمان‌بندی جدا + staging)

## Soak شبانه (بعدی)

- VUs پایدار ۳۰–۶۰ دقیقه روی staging
- بودجهٔ burn از OTLP/SLO (R10-01) نه فقط k6 summary
- مسیر مالی با حساب تست ایزوله
