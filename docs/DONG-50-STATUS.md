# وضعیت پیاده‌سازی dong-50

پیگیری ۵۰ پیشنهاد `dong-50.md` — بدون دادهٔ نمایشی؛ هر UI به state/API واقعی یا اقدام واقعی (mailto/لینک) وصل است.

| # | موضوع | وضعیت |
|---|--------|--------|
| 1–4 | Modal focus-trap / Escape / restore / initial focus | ✅ `packages/ui` Modal |
| 5–7 | Field `error` / aria / required | ✅ |
| 8 | Skeleton vs empty | ✅ `EmptyHint loading` در ویوها |
| 9 | Flash aria-live | ✅ `FlashMessages` |
| 10 | Table/Tabs/Badge/Toast/EmptyState | ✅ `patterns.tsx` + Storybook |
| 11 | axe روی مسیرهای پرکاربرد | ✅ `a11y-shell.spec.ts` (+ expenses/ledger/…) |
| 12 | moderate به‌صورت warn | ✅ |
| 13 | قانون ۴۸px در DESIGN-SYSTEM | ✅ §11 |
| 14 | متریک onboarding | ✅ سند `PRODUCT-METRICS.md` (بدون داشبورد جعلی) |
| 15 | بازبینی classic هر ۶ ماه | ✅ DESIGN-SYSTEM §12 |
| 16 | Empty CTA | ✅ finance / friends |
| 17 | Step indicator تقسیم هزینه | ✅ |
| 18 | font-display swap | ✅ از قبل در `layout.tsx` |
| 19 | Amount LTR + تست | ✅ |
| 20 | DirIcon RTL | ✅ |
| 21 | تصمیم i18n تک‌زبانه | ✅ `docs/I18N.md` |
| 22 | keyboard journey e2e | ✅ smoke + سند follow-up |
| 23 | license hard-fail | ✅ |
| 24 | a11y بدون Chrome → fail | ✅ |
| 25–26 | Zod GET exemption + ADR | ✅ |
| 27 | integration expenses→journal→balances | ✅ |
| 28 | MFA recovery hash | ✅ کد + `MFA-STORAGE.md` |
| 29 | رفکتور finance-view | ✅ ~496 خط + پنل‌ها / `use-finance-actions` |
| 30 | تفکیک api.ts | ✅ barrel نازک (~65 خط) + ماژول‌های دامنه |
| 31 | Redis degrade warn | ✅ |
| 32 | هشدار CI روی یافته امنیتی | ✅ |
| 33 | داشبورد محصول | ✅ `/w/[slug]/metrics` از audit واقعی (بدون نرخ جعلی) |
| 34 | لینک بازخورد | ✅ mailto در shell |
| 35 | Storybook گسترش | ✅ |
| 36 | تغییرات اخیر | ✅ `/whats-new` |
| 37 | نشان پیش‌نویس آفلاین | ✅ |
| 38 | Lighthouse / CWV | ✅ `PERF-CWV.md` + workflow اختیاری |
| 39 | PWA offline test | ✅ |
| 40 | NPS بعد از تسویه | ✅ mailto واقعی (بدون API جعلی) |
| 41 | الگوی thin controller | ✅ ADR |
| 42 | بودجه خط ویو | ✅ `views:line-budget` |
| 43 | DESIGN-SYSTEM هم‌راستا | ✅ |
| 44 | PR template checklist | ✅ |
| 45 | coverage contracts | ✅ threshold بالا رفته |
| 46 | e2e expense→balance→settlement | ✅ auto-seed `/demo/seed` + سطوح seeded |
| 47 | middleware prefix tests | ✅ |
| 48 | ADR argon2id hash-wasm | ✅ |
| 49 | worker DLQ retry موفق | ✅ |
| 50 | بررسی PUBLIC_PREFIXES | ✅ ADR |

## عمداً وابسته به زیرساخت

- **e2e عمیق:** با `PLAYWRIGHT_WORKSPACE_SLUG` یا auto-seed از `/demo/seed` (وقتی API با `ALLOW_DEV_AUTH` بالا باشد) اجرا می‌شود؛ در غیر این صورت skip صریح.
