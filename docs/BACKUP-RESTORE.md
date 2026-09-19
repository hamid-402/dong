# Backup و Disaster Recovery

هدف: بازیابی قابل‌اعتماد workspaceها و دفترکل بدون از دست رفتن Integrity.

مرجع PITR / drill: [`docs/ops/PITR.md`](./ops/PITR.md) · پروندهٔ exec: [`docs/exec/S10-B3.md`](./exec/S10-B3.md)

## دامنه Backup

| جزء | روش پیشنهادی | RPO هدف | RTO هدف |
|---|---|---|---|
| PostgreSQL | `pg_dump` روزانه + WAL archive / PITR ابری | ≤ ۱۵ دقیقه | ≤ ۱ ساعت |
| Object storage (رسیدها) | Versioned bucket / lifecycle | ≤ ۱۵ دقیقه | ≤ ۱ ساعت |
| Secrets | Vault / KMS — خارج از DB dump | — | — |

## Backup محلی (توسعه)

```powershell
# ترجیح: اسکریپت monorepo (pg_dump یا docker compose)
pnpm dr:backup
# خروجی: backups/dang-*.dump
```

دستی:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = "backups/dang-$stamp.dump"
New-Item -ItemType Directory -Force -Path backups | Out-Null
pg_dump --format=custom --file=$out $env:DATABASE_URL
```

## Restore drill

```powershell
# DATABASE_URL باید حق CREATE DATABASE داشته باشد؛ psql/pg_dump/pg_restore در PATH
pnpm dr:drill
```

اسکریپت: dump → `dang_drill` → verify schema/tables → `backups/drills/drill-*.json`.

دستی:

```powershell
pg_restore --clean --if-exists --dbname=$env:DATABASE_URL backups/dang-YYYYMMDD-HHMMSS.dump
pnpm --filter @dang/db db:migrate
```

## Drill ماهانه (staging / prod-like)

1. Restore روی DB جدا (`dang_drill` یا instance جدا)
2. `pnpm --filter @dang/db test` با `DATABASE_URL` drill (اختیاری)
3. `GET /api/v1/health/ready` باید `ready` باشد (وقتی API به همان DB وصل است)
4. یک Workspace نمونه و `zeroSum` مانده را چک کنید
5. نتیجه را در تیکت On-call یا `docs/STATUS.md` ثبت کنید

CI: job `DR restore drill (R10-07)` روی هر PR پس از migrate؛ سپس `pnpm dr:wal:dry-run` برای RPO math محلی.

## Failover

- Staging: تک‌منطقه‌ای کافی است.
- Production: Primary + replica خواندنی؛ promote طبق Runbook cloud provider · PITR: `docs/ops/PITR.md`.
- API بدون `DATABASE_URL` به memory fallback می‌کند — **برای Production ممنوع**؛ `DANG_REQUIRE_POSTGRES=1` را ست کنید تا `/health/ready` در نبود DB، `503` بدهد.

## آنچه Backup نیست

- Memory storeها (IAM/Expense بدون Postgres)
- Offline draftهای مرورگر (`localStorage`)
- Secretهای `.env` محلی
