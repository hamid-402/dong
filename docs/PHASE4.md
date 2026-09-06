# فاز ۴ — DevOps

## ۴.۱ پین نسخه‌ها
همهٔ `"latest"` در package.jsonها به `^x.y.z` از lockfile تبدیل شدند.

## ۴.۲ Renovate
`renovate.json` در ریشه — schedule دوشنبه، majorها نیاز به approval دارند.

## ۴.۳ Docker
- `apps/api/Dockerfile`
- `apps/web/Dockerfile` (`output: "standalone"` در next.config)
- `apps/worker/Dockerfile`
- `.dockerignore`

بیلد از ریشهٔ مونوریپو با `turbo prune`.

## ۴.۴ Pre-commit
- `husky` + `lint-staged`
- `.husky/pre-commit` → `pnpm lint-staged`
- روی `*.{ts,tsx}`: `eslint --fix --max-warnings=0`
