# Runbook — دنگ همکاری

اسکلت عملیاتی برای تیم توسعه و on-call (فاز ۰–۲).

## سرویس‌ها

| سرویس | پورت | دستور |
|---|---|---|
| Web | 3005 | `pnpm dev:web` |
| API | 3006 | `pnpm dev:api` |
| Worker | — | `pnpm dev:worker` |
| Postgres (compose) | 5435 | `docker compose -f infra/compose.local.yml up -d postgres` |

## Health checks

```powershell
curl.exe -s http://localhost:3006/api/v1/health
curl.exe -s http://localhost:3006/api/v1/health/live
curl.exe -s http://localhost:3006/api/v1/health/ready
curl.exe -s http://localhost:3006/api/v1/system/capabilities
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3005/workspaces
```

برای Production، `DANG_REQUIRE_POSTGRES=1` را ست کنید تا بدون DB، `/health/ready` برابر `503` شود.

## Backup / DR

`docs/BACKUP-RESTORE.md`

## Hardening / DAST checklist

`docs/SECURITY-HARDENING.md`

## Postgres (محلی)

1. `docs/LOCAL-DATABASE.md` — نقش‌ها، migrate تا `0010`، Grant
2. `$env:DATABASE_URL="postgresql://dang_migrator:<PASSWORD>@127.0.0.1:5432/dang"`
3. `pnpm db:migrate`
4. API runtime با `dang_runtime` (نه migrator)

## کیفیت

```powershell
pnpm check    # lint + typecheck + build
pnpm test     # contracts + db RLS (skip بدون DATABASE_URL)
```

## Incident — API/Web بالا نمی‌آید (localhost)

علائم رایج:
- Web روی `:3005` timeout می‌دهد
- `curl http://localhost:3006/api/v1/health` وصل نمی‌شود

علل دیده‌شده:
1. **tsx watch وسط ویرایش کرش کرده** (مثلاً `Cannot find module 'drizzle-orm'` یا Nest `provide` undefined) و پورت خالی مانده
2. **پروسهٔ قدیمی Node گیر کرده** — پورت LISTENING است ولی پاسخ نمی‌دهد
3. چند نمونهٔ `pnpm dev:api` همزمان

بازیابی سریع (PowerShell):

```powershell
# آزاد کردن پورت‌ها
foreach ($p in 3005,3006) {
  netstat -ano | findstr ":$p" | findstr LISTENING | ForEach-Object {
    if ($_ -match '\s+(\d+)\s*$') { Stop-Process -Id ([int]$Matches[1]) -Force -ErrorAction SilentlyContinue }
  }
}

cd "C:\Users\hamid.kazemi\Desktop\دنگ"
pnpm --filter @dang/db build
pnpm dev:api   # ترمینال ۱ → http://localhost:3006
pnpm dev:web   # ترمینال ۲ → http://localhost:3005
```

Smoke:

```powershell
curl.exe -s http://localhost:3006/api/v1/health
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3005/workspaces
```

## Incident — API down

1. پورت 3006 اشغال؟ `netstat -ano | findstr :3006`
2. لاگ API: خطای `DATABASE_URL` یا `EADDRINUSE`
3. بدون DB: API باید روی memory بالا بیاید
4. اگر `tsx` بعد از save کرش کرد: ترمینال را ببندید و `pnpm dev:api` را دوباره بزنید

## Incident — مانده غیرصفر

1. `GET .../balances` — `zeroSum` باید true باشد
2. `GET .../ledger/entries` — debit = credit برای هر entry
3. تست قرارداد: `pnpm --filter @dang/contracts test`

## Rollback migration

Migrationها forward-only هستند. Rollback = restore از backup یا DB جدید + migrate.

## تماس / مسئولیت (پر کنید)

- Product owner: —
- Finance domain: —
- On-call: —
