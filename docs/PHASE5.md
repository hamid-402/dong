# فاز ۵ — صیقل و رشد بلندمدت

آیتم‌های زیر بخشی پیاده‌سازی شده‌اند؛ بقیه بر اساس اولویت محصول زمان‌بندی می‌شوند.

| آیتم | وضعیت |
|------|--------|
| MFA/TOTP برای Owner/Admin/Finance | **done** — migration `0033_mfa_totp`؛ `POST /auth/mfa/*`؛ چالش لاگین؛ `capabilities.mfa` |
| axe/a11y خودکار | **done** — `apps/web/e2e/a11y-login.spec.ts` + `pnpm test:a11y`؛ CI فقط وقتی Chrome/browser در دسترس باشد وگرنه skip |
| تست یکپارچه ClamAV/OCR با سرویس واقعی | فقط همزمان با `CLAMAV_ENABLED=1` / `OCR_ENABLED=1` |
| Dead-letter queue برای Redis jobs | **done** — `docs/PHASE2-REDIS.md`؛ worker retries→DLQ؛ API list/replay (owner/admin) |
| بودجه bundle-size | **done** — `scripts/check-bundle-budget.mjs` (ترجیح `.next/static` ۱۵ MiB fail؛ standalone fallback ۲۵ MiB) |
| Storybook برای `@dang/ui` | **done** — Button / Modal / Field؛ `pnpm --filter @dang/ui storybook` |
| i18n آماده‌سازی | **done** — `apps/web/src/messages/{fa,en}.json` + `lib/i18n.ts` (پیش‌فرض fa)؛ عنوان لاگین از catalog |
| license review | **done** — `pnpm license:check` (`scripts/license-check.mjs`؛ fail روی GPL-only) |
| داشبورد متریک کسب‌وکار | **بک‌لاگ** — نیاز به product metrics + aggregate واقعی از DB؛ تا قبل از آن UI آمار جعلی اضافه نشود |

## نحوهٔ اجرای چک‌ها

```bash
# DLQ shape / retry (بدون Redis)
pnpm --filter @dang/contracts test
pnpm --filter @dang/worker test

# a11y (نیاز به build وب + Chrome؛ در CI اگر browser نبود skip می‌شود)
pnpm --filter @dang/web build
pnpm --filter @dang/web test:a11y

# bundle budget (بعد از web build)
pnpm --filter @dang/web build
pnpm bundle:check

# licenses
pnpm license:check

# Storybook
pnpm --filter @dang/ui storybook
pnpm --filter @dang/ui build-storybook
```

## بودجه bundle

- مسیر اندازه‌گیری (ترجیح): `apps/web/.next/static` — دارایی‌های کلاینت
  - هشدار: ۸ MiB / شکست: ۱۵ MiB
- Fallback: `.next/standalone` (شامل runtime سرور Node)
  - هشدار: ۲۰ MiB / شکست: ۲۵ MiB
- Override: `BUNDLE_BUDGET_BYTES` / `BUNDLE_BUDGET_WARN_BYTES`
- CI: بعد از `pnpm check` به‌صورت step جدا؛ fail واقعی وقتی artifact وجود دارد

## آماده لانچ با پول واقعی (چک‌لیست)

- [x] CI با Postgres + migrate + dang_runtime + cross-tenant + gitleaks
- [x] Branch protection required check `check` (اعمال‌شده — `docs/CI-PHASE0.md`)
- [x] Zod روی همه `@Body()` با `ZodValidationPipe` + schemas از `@dang/contracts`
- [x] Fail-closed AV (policy + unit tests؛ stub وقتی ClamAV خاموش است)
- [x] Zero-sum ledger در اپ + DB trigger
- [x] Argon2id + ارتقای scrypt در لاگین
- [x] زرین‌پال: amount سمت سرور
- [x] Rate-limit / idempotency Redis-ready
- [x] Dev-auth در production قفل‌شده با تست
- [x] `docs/SECURITY.md` با واقعیت هم‌خوان (MFA پیاده‌سازی‌شده)
- [x] Redis DLQ + owner/admin replay API
- [x] a11y smoke (login) + bundle budget + license check scaffolding
