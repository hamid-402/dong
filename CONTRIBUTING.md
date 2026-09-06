# مشارکت در دنگ همکاری

## پیش‌نیاز

- Node.js ≥ 24
- pnpm 10.34.5 (`packageManager` در ریشه)
- Postgres 17 برای تست‌های DB / CI
- Docker (اختیاری) برای Testcontainers

## دستورهای رایج

```bash
pnpm install
pnpm db:migrate
pnpm dev:api    # :3006
pnpm dev:web    # :3005
pnpm check      # lint + typecheck + build
pnpm test
pnpm test:coverage
```

## قوانین

- بدون داده/وضعیت نمایشی جعلی (`.cursor/rules/no-fake-data.mdc`)
- گسترش فقط additive؛ حذف route/API فقط با جایگزینی کامل
- endpoint جدید body/query باید Zod schema داشته باشد (`.strict()`)
- stubها در `capabilities` صادقانه گزارش شوند

## Git hooks

`husky` + `lint-staged` روی pre-commit: `eslint --fix` برای `*.{ts,tsx}`.

## تست

| لایه | ابزار | مسیر |
|------|--------|------|
| contracts / api / db | node:test / tsx | `pnpm test` |
| web unit / component | Vitest + Testing Library | `pnpm --filter @dang/web test` |
| E2E smoke | Playwright | `pnpm --filter @dang/web test:e2e:install && pnpm test:e2e` |

## Docker

از ریشهٔ مونوریپو:

```bash
docker build -f apps/api/Dockerfile -t dang-api .
docker build -f apps/web/Dockerfile -t dang-web .
docker build -f apps/worker/Dockerfile -t dang-worker .
```

## اسناد مرتبط

- `docs/CI-PHASE0.md` — CI و branch protection
- `docs/PHASE2-REDIS.md` — Redis / 409 idempotency
- `docs/PHASE3.md` — تست و رفکتور
- `docs/SECURITY.md` — کنترل‌های امنیتی (با برچسب وضعیت واقعی)
