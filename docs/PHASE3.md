# فاز ۳ — تست و کیفیت کد

## انجام‌شده

### ۳.۳ Coverage gate روی منطق مالی (`@dang/contracts`)
- `pnpm test:coverage` — lines ≥ ۸۰٪ / branches ≥ ۶۵٪ روی ماژول‌های مالی

### ۳.۲ Frontend
- Vitest: `irr-money`، `auth-validation`، `hub-nav-url`، `split-composer` payload
- Testing Library: validation فرم لاگین (`login-view.test.tsx`)
- Playwright smoke: `apps/web/e2e/login.spec.ts` (`pnpm --filter @dang/web test:e2e:install && pnpm test:e2e` پس از `next build`)

### ۳.۱ Integration
- `expense-ledger.integration.test.ts` + Testcontainers bootstrap

### ۳.۴ رفکتور
- `DailyLedgerService`
- `api/client.ts` + `authApi` + `expensesApi`
- `finance/use-finance-data.ts` + `finance-summary-card.tsx`

### ۳.۵ Design system
- `Modal` / `Skeleton` در `@dang/ui`

## ادامهٔ اختیاری
- شکستن بیشتر `finance-view.tsx` / `daily-ledger-view.tsx`
- Playwright مسیر کامل signup → expense → balance در CI
- آستانه coverage ۹۰٪
