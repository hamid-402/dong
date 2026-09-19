# DAST — OWASP ZAP Baseline (R10-02)

## هدف

اسکن baseline روی سطح حملهٔ HTTP API/web بدون ادعای «نفوذ کامل». یافته‌های High/Critical باید triage شوند؛ بستن رسمی با R10-22.

## اجرای محلی

پیش‌نیاز: Docker.

```bash
# API در حال اجرا، مثلاً http://127.0.0.1:3006
docker run --rm -v "%cd%:/zap/wrk:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://host.docker.internal:3006 -r zap-report.html -I
```

روی Linux به‌جای `host.docker.internal` از IP میزبان یا `--network host` استفاده کنید.

خروجی: `zap-report.html` در ریشهٔ repo (gitignore اگر لازم).

## GitHub Actions

Workflow: [`.github/workflows/dast-zap.yml`](../../.github/workflows/dast-zap.yml)

- `workflow_dispatch` با ورودی `target_url` (پیش‌فرض از secret `ZAP_TARGET_URL`)
- اگر URL خالی باشد job با پیام صریح **skip** می‌شود (شکست جعلی نیست)
- با `-I` (info) fail نمی‌کند؛ WARN/FAIL سطح ZAP برای High+ باید در گزارش بررسی شود
- artifact گزارش HTML آپلود می‌شود

Secret پیشنهادی: `ZAP_TARGET_URL=https://staging.example/api` (بدون مسیر مخرب).

## قوانین صداقت

- اسکن روی production واقعی فقط با مجوز مالک
- نتایج را در UI محصول به‌عنوان «امن» نشان ندهید مگر triage انجام شده باشد
- capabilities ادعای DAST نمی‌کند — فقط اسناد/CI
