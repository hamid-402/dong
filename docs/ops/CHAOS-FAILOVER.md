# Chaos / failover محلی (R10-08)

| فیلد | مقدار |
|------|--------|
| وضعیت | اسکلت compose stop/start + بررسی health |
| قانون | بدون ادعای chaos engineering کامل در UI |

## هدف این برش

ثابت کردن که قطع **Valkey** یا **Postgres** در stack محلی روی `/api/v1/health/ready` دیده می‌شود و پس از `start` بازیابی می‌شود.

## پیش‌نیاز

```bash
docker compose -f infra/compose.local.yml up -d postgres valkey
# API با REDIS_URL / DATABASE_URL واقعی
pnpm dev:api
```

برای fail سخت Redis: `DANG_REQUIRE_REDIS=1` · برای Postgres: `DANG_REQUIRE_POSTGRES=1`.

## اجرا

```bash
pnpm chaos:local
# یا
CHAOS_TARGET=postgres pnpm chaos:local
```

اسکریپت اگر Docker نباشد با `skipped: true` خارج می‌شود (exit 0) تا CI بدون Docker نشکند.

## خارج از برش

- Chaos Mesh / Gremlin در cluster
- partition شبکه چند‌نوده‌ای
- failover خودکار promote replica (وابسته به provider — هم‌راستا با R10-07 PITR)
