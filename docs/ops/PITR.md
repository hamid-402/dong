# PITR و بازیابی نقطه‌ای (R10-07)

| فیلد | مقدار |
|------|--------|
| وضعیت | runbook + drill منطقی + WAL محلی/RPO dry-run · PITR ابری با provider هنوز باز |
| قانون | بدون ادعای PITR تا WAL archive واقعی در محیط هدف روشن باشد |

## لایه‌ها

| لایه | چیست | کجا |
|------|------|-----|
| A — Logical dump | `pg_dump` custom + restore به `dang_drill` | `pnpm dr:backup` / `pnpm dr:drill` · CI job `dr-restore-drill` |
| B — WAL archive محلی | Postgres با `archive_mode` → `.dang/wal-archive` | `pnpm dr:wal:archive` · compose profile `pitr` |
| C — PITR تولید | Continuous backup / PITR ابری (RDS, Cloud SQL, …) | تنظیمات provider · این repo فقط چک‌لیست |

## Drill منطقی (حداقل ماهانه / هر PR در CI)

```bash
# نیاز: DATABASE_URL با حق CREATE DATABASE + psql/pg_dump/pg_restore
pnpm dr:drill
```

خروجی: `backups/drills/drill-*.json` (+ `LATEST.json`). این پوشه gitignore است — نتیجهٔ سبز CI در Actions لاگ می‌شود.

چک‌های خودکار: schemaهای `finance` / `accounting` / `iam` / `ops` و جداول کلیدی (`expense`, `settlement`, `journal_entry`, `workspace`).

پس از restore دستی روی staging: `GET /api/v1/health/ready` و یک مسیر مالی نمونه (ر.ک. `docs/BACKUP-RESTORE.md`).

## آرشیو WAL روی میزبان (`.dang/wal-archive`)

```bash
# یک‌بار / حلقه — bind-mount یا docker cp از postgres-pitr
pnpm dr:wal:archive
pnpm dr:wal:archive -- --loop --switch

# تمرین زمان‌مند RPO (لوکال)
pnpm dr:wal:drill

# CI / بدون cloud
pnpm dr:wal:dry-run
```

خروجی عمق: `.dang/wal-archive/LATEST.json` · drill: `backups/drills/pitr-timed-*.json`.

## پروفایل محلی WAL (`pitr`)

```bash
docker compose -f infra/compose.local.yml --profile pitr up -d postgres-pitr
# پورت 5436 · آرشیو bind روی ../.dang/wal-archive
```

این برای تمرین `archive_command` است؛ جایگزین backup ابری نیست.

## چک‌لیست PITR تولید (مالک infra)

1. Continuous backup / WAL shipping روشن روی Postgres تولید
2. RPO/RTO با `docs/BACKUP-RESTORE.md` هم‌خوان
3. یک drill restore به زمان T−N روی instance جدا
4. Secretها از dump جدا (Vault/KMS — R10-06)
5. نتیجهٔ drill در تیکت on-call یا STATUS ثبت شود

## آنچه ادعا نمی‌کنیم

- UI محصول «DR آماده» نشان نمی‌دهد
- capabilities ادعای PITR نمی‌کند تا provider وصل و drill سبز مستند شود
