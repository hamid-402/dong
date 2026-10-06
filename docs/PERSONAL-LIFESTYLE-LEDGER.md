# دفتر زندگی مالی شخصی (Personal Lifestyle Ledger)

لایهٔ additive روی `/me/finance` برای چرخهٔ حقوق ماهانهٔ شمسی، تخصیص درصدی به حوزه‌های زندگی، تراز بسته، و گزارش سالانه.

## معادلهٔ ماه

```text
حقوق ماه ≈ پس‌انداز ماه + مصرف سبک‌زندگی ماه
```

- **مصرف سبک‌زندگی** = سهم (`share`) در فضاهای غیرشخصی + خرج‌های `money_txn` شخصی (+ سهم فضای `personal`)
- **نقد از جیب (`paid`)** فقط اطلاعاتی است و در معادلهٔ تراز نیست
- **پس‌انداز** = مجموع واریز به اهداف/صندوق در همان ماه شمسی

## حوزه‌ها (`LifeDomain`)

| حوزه | منبع |
|------|------|
| `solo` | خرج شخصی + workspace با `spaceKind=personal` |
| `group` | share در `group` |
| `building` | share در `building` |
| `org` | share در `org` |
| `savings` | contributions |

پیش‌فرض تخصیص: ۳۰٪ پس‌انداز، ۴۰٪ شخصی، ۱۵٪ گروه، ۱۰٪ ساختمان، ۵٪ سازمان.

## API

| Method | Path | نقش |
|--------|------|-----|
| `GET`/`PUT` | `/me/finance/allocation-plan` | درصد پایدار کاربر (جمع = ۱۰۰) |
| `GET`/`POST` | `/me/finance/paychecks` | حقوق ماه شمسی یکتا؛ `POST` یک `money_txn` درآمد می‌سازد |
| `GET` | `/me/finance/lifestyle?yearMonth=` | اسنپ‌شات تراز + breakdown حوزه‌ها |
| `POST` | `/me/finance/statements/annual` | بستهٔ سالانه (`csv` یا `html_print`) |

بدون حقوق ثبت‌شده، `emptyReason` صادقانه برمی‌گردد — عدد جعلی نیست.

## Persistence

- جداول `personal.allocation_plan` و `personal.paycheck` (مهاجرت `0088_personal_lifestyle_ledger.sql`)
- Store حافظه/Postgres در `PersonalGoalsStore`
- `monthlyClose.savedMinor` در صورت وجود contribution واقعی از همان منبع تغذیه می‌شود

## UI

- کامپوننت `PersonalLifestyleCommand` بالای hub در `/me/finance#lifestyle`
- Deep-link از «دفتر من» و Home Money Command
- دکمه‌های CSV / چاپ HTML سالانه روی همان سطح

## قراردادها

Pure engine: `packages/contracts/src/personal-lifestyle.ts`  
تست: `packages/contracts/tests/personal-lifestyle.test.ts`، `apps/api/src/personal-finance/personal-lifestyle.test.ts`، `apps/web/e2e/personal-lifestyle.spec.ts`
