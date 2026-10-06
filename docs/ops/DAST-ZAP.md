# DAST — OWASP ZAP Baseline (R10-02 / R6)

## هدف

اسکن baseline روی سطح حملهٔ HTTP API/web بدون ادعای «نفوذ کامل».
**High/Critical سخت fail می‌شوند** (وقتی target تنظیم شده). Medium برای triage در artifact می‌ماند.

## اجرای محلی

پیش‌نیاز: Docker.

```bash
docker run --rm -v "%cd%:/zap/wrk:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://host.docker.internal:3006 \
  -r zap-report.html -J report_json.json -c .zap/rules.tsv -I
node scripts/security/zap-fail-on-high.mjs report_json.json
```

روی Linux به‌جای `host.docker.internal` از IP میزبان یا `--network host` استفاده کنید.

## GitHub Actions

Workflow: [`.github/workflows/dast-zap.yml`](../../.github/workflows/dast-zap.yml)

- `workflow_dispatch` با ورودی `target_url` (یا secret `ZAP_TARGET_URL`)
- اگر URL خالی باشد job با پیام صریح **skip** می‌شود (شکست جعلی نیست)
- `fail_action: false` روی خود action — تا Medium WARN کل job را نسوزاند
- قوانین نویز Low/INFO در `.zap/rules.tsv`
- **Hard gate:** `node scripts/security/zap-fail-on-high.mjs report_json.json` (riskcode ≥ 3)
- artifact: HTML + JSON

Secret پیشنهادی: `ZAP_TARGET_URL=https://staging.example` (بدون مسیر مخرب).

## قوانین صداقت

- اسکن روی production واقعی فقط با مجوز مالک
- نتایج را در UI محصول به‌عنوان «امن» نشان ندهید مگر triage انجام شده باشد
- capabilities ادعای DAST نمی‌کند — فقط اسناد/CI
