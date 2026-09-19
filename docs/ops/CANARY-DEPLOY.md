# Canary / blue-green gate (R10-16 / W6)

| فیلد | مقدار |
|------|--------|
| وضعیت | gate اسکریپتی + runbook · بدون ارکستراتور ابری اجباری |
| قانون | promote فقط وقتی health/capabilities/login سبز است؛ با Redis → heartbeat worker زنده |

## جریان پیشنهادی

```text
build artifact (digest)
  → deploy canary slot (۵٪ یا instance جدا)
    → pnpm canary:gate   # API_URL/WEB_URL = canary
      → fail → rollback / hold
      → ok → promote 25٪ → gate → 100٪
```

Auto-rollback واقعی وابسته به orchestrator (K8s/ECS/…) است؛ این repo سیگنال fail را می‌دهد.

## اجرا

```bash
# بعد از بالا آمدن canary
API_URL=https://canary-api.example WEB_URL=https://canary.example pnpm canary:gate

# محلی
pnpm canary:gate
```

### Env

| متغیر | پیش‌فرض | معنی |
|--------|---------|------|
| `CANARY_REQUIRE_READY` | `1` | `0` اجازه می‌دهد `degraded` عبور کند (فقط debug) |
| `CANARY_REQUIRE_WORKER` | `1` | اگر `integrationsReady.workerConsumer.redisConfigured` باشد، `heartbeatAlive` باید true باشد |
| `CANARY_CHECK_SLO` | خاموش | اگر `1`، `GET /platform/slo` را می‌خواند؛ روی breach واقعی fail می‌کند |
| `CANARY_SLO_COOKIE` | — | Cookie نشست platform برای SLO؛ بدون آن 401/403 = skip (بدون burn جعلی) |

## CI

Workflow: [`.github/workflows/canary-gate.yml`](../../.github/workflows/canary-gate.yml) — `workflow_dispatch` با URLها یا secrets `CANARY_API_URL` / `CANARY_WEB_URL`.

## خارج از برش

- وزن‌دهی ترافیک ابری
- burn-rate SLO خودکار از OTLP بدون auth
- blue-green dual stack کامل
