# Backup و Disaster Recovery

هدف: بازیابی قابل‌اعتماد workspaceها و دفترکل بدون از دست رفتن Integrity.

## دامنه Backup

| جزء | روش پیشنهادی | RPO هدف | RTO هدف |
|---|---|---|---|
| PostgreSQL | `pg_dump` روزانه + WAL archive | ≤ ۱۵ دقیقه | ≤ ۱ ساعت |
| Object storage (رسیدها) | Versioned bucket / lifecycle | ≤ ۱۵ دقیقه | ≤ ۱ ساعت |
| Secrets | Vault / KMS — خارج از DB dump | — | — |

## Backup محلی (توسعه)

```powershell
# فقط وقتی DATABASE_URL migrator فعال است
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = "backups/dang-$stamp.dump"
New-Item -ItemType Directory -Force -Path backups | Out-Null
# pg_dump باید در PATH باشد
pg_dump --format=custom --file=$out $env:DATABASE_URL
```

Restore:

```powershell
# روی دیتابیس خالی
pg_restore --clean --if-exists --dbname=$env:DATABASE_URL backups/dang-YYYYMMDD-HHMMSS.dump
pnpm --filter @dang/db db:migrate
```

## Drill ماهانه

1. Restore روی DB جدا (`dang_drill`)
2. `pnpm --filter @dang/db test` با `DATABASE_URL` drill
3. `GET /api/v1/health/ready` باید `ready` باشد
4. یک Workspace نمونه و `zeroSum` مانده را چک کنید
5. نتیجه را در `docs/STATUS.md` یا تیکت On-call ثبت کنید

## Failover

- Staging: تک‌منطقه‌ای کافی است.
- Production: Primary + replica خواندنی؛ promote طبق Runbook cloud provider.
- API بدون `DATABASE_URL` به memory fallback می‌کند — **برای Production ممنوع**؛ `DANG_REQUIRE_POSTGRES=1` را ست کنید تا `/health/ready` در نبود DB، `503` بدهد.

## آنچه Backup نیست

- Memory storeها (IAM/Expense بدون Postgres)
- Offline draftهای مرورگر (`localStorage`)
- Secretهای `.env` محلی
