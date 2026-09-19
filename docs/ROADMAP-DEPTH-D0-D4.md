# Depth Campaign D0–D4 — اجرای عمیق بدون وابستگی بیرونی

| فیلد | مقدار |
|------|--------|
| وضعیت | **عمیق محصولی + کشف‌پذیری UI** — ۱۴۰۵/۰۶/۲۲ |
| اصل | عمق واقعی در ریپو · بدون Vault/Grafana/PSP/vendor ابری |
| قانون | additive · capabilities صادق · تست برای هر DoD |

## مهاجرت‌های عمق (journal)
`0056_local_psp` → `0057_security_events` → `0058_payment_on_behalf` → `0059_local_key_vault` → `0060_outbox_relay_stats` → `0061_security_event_workspace_idx`

## موج UI depth (کشف‌پذیری + نازک‌ها)

| آیتم | وضعیت |
|------|--------|
| کشف `/admin` در accountNav / More / palette | **DONE** (نقش platform + capability) |
| `/w/.../security-ops` antifraud + access events | **DONE** |
| `GET /platform/outbox/stats` + کارت admin + `/admin/slo` | **DONE** (بدون صفر جعلی) |
| maker-checker StatusLine در approvals | **DONE** |
| offline list + retry در زنگ | **DONE** |
| enqueue offline برای draft خرج + settlement claim + payment link | **DONE** |
| SSE aria/status صادق | **DONE** |
| Redis fan-out SSE وقتی `REDIS_URL` زنده | **DONE** (`providers.realtime=sse_redis`؛ وگرنه `sse_local`) |
| audit integrity hint | **DONE** |
| i18n کلیدهای جدید + `nav.*` | **DONE** (parity fa/en) |
| a11y admin / slo / vault / security-ops | **برش DONE** |
| visual opt-in + soft CI artifact | **برش DONE** (hard-CI لینوکس عمداً باز تا baseline commit) |
| contract live: outbox + workspace security-events | **DONE** |
| تست API workspace security-events (guest deny) | **DONE** |
| تست offline queue unit | **DONE** |

## D0–D4 قبلی
S11-09/12 · Local Vault · security-events · SLO · LocalPSP · WAL drill محلی — مطابق قبل؛ جزئیات در STATUS.

## عمداً باز / PARTIAL صادق
Vault/Grafana/PITR ابری · multi-device CRDT · ML antifraud · Pact/VPAT · visual **hard**-CI لینوکس (تا snapshot لینوکس commit شود) · SaaS proration/trial
