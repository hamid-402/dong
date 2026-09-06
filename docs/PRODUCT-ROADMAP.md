# نقشه راه محصول دنگ همکاری (نسخه اجرایی)

| فیلد | مقدار |
|------|--------|
| وضعیت | **فازهای محصولی ۰–۳ از نظر DoD کد تکمیل؛ فاز ۴ فقط با کلید واقعی** |
| نسخه | 2.2 |
| تاریخ | ۱۴۰۵/۰۶/۱۴ (۵ سپتامبر ۲۰۲۶) |
| جایگزین جزئی | تکمیل‌کنندهٔ `ROADMAP.md` (فازهای مهندسی پایه) و اصلاح‌کنندهٔ جهت محصول نسبت به `MASTER-PLAN.md` |
| قانون طلایی | هیچ قابلیت نمایشی؛ بکند + فرانت + DB + امنیت + UX هم‌زمان |

---

## ۰. خلاصه اجرایی

دنگ همکاری باید یک **هسته مالی مشترک** با **سه فضای تجربهٔ جدا** باشد:

1. **شخصی** — دفتر مالی من  
2. **گروهی** — دوستان / خانواده / سفر (دنگ)  
3. **سازمانی** — تیم / شرکت کوچک  

داخل هر فضا: **عمومی (جمعی)** در برابر **خصوصی (مختص یک نفر)**.

موتور سهم باید حداقل این دو سناریوی روزمره را first-class کند:

| سناریو | منطق | برچسب UX |
|--------|------|----------|
| بستنی جمعی | مبلغ ÷ حاضران | مساوی بین این افراد |
| ناهار سفارشی | سهم = سفارش هر نفر | بر اساس سفارش / مبلغ هر نفر → سپس آیتمی فاکتور |

خانواده قالبِ فضای گروهی است (سهم پیش‌فرض ثابت)، نه فضای چهارم موازی.

---

## ۱. اصول غیرقابل‌مذاکره

1. **صداقت runtime:** badge، آمار، PSP، OCR، AV، job فقط با منبع واقعی یا حذف از UI (قانون `.cursor/rules/no-fake-data.mdc`).
2. **هم‌سطح‌سازی لایه‌ها:** هر epic باید packages/contracts + packages/db (migration) + apps/api + apps/web (+ worker در صورت نیاز) را لمس کند؛ وگرنه در UI ظاهر نمی‌شود.
3. **صفر نمایشی:** stub فقط در `GET /system/capabilities` گزارش می‌شود؛ UI بر اساس capability شاخه می‌زند.
4. **IRR minor واحد حقیقت:** همه مبالغ bigint ریال جزئی؛ نمایش تومان فقط در UI.
5. **جمع سهم = مبلغ کل** همیشه؛ باقی‌ماندهٔ تقسیم مساوی طبق قرارداد فعلی (ریال اول به اولین شرکت‌کننده).
6. **خصوصی روی مانده دیگران اثر ندارد** و در لیست دیگران دیده نمی‌شود.
7. **گسترش فقط رو به جلو (قانون طلایی مالک محصول):** در هر مرحله سامانه تماماً ارتقا می‌یابد؛ قابلیت جدید باعث حذف یا نادیده‌گرفتن قابلیت قبلی نمی‌شود. مسیرها، APIها و جریان‌های موجود حفظ یا با معادل کامل‌تر گسترش می‌یابند.
8. **وضعیت اجرا:** تأیید کامل مالک محصول دریافت شد — اجرا از فاز ۰ به‌صورت additive آغاز شده است.

---

## ۲. معماری محصول هدف

### ۲.۱ سه فضای جدا (Information Architecture)

```text
حساب کاربر
├── فضای شخصی (Personal Space)
│   ├── خرج خصوصی من
│   ├── دسته / بودجه ساده
│   └── گزارش بازه‌ای شخصی + export
├── گروه‌ها (Group Spaces) — N گروه
│   ├── قالب: friends | family_household | trip
│   ├── خرج عمومی گروه → ledger مانده
│   ├── خرج خصوصی داخل گروه (فقط من)
│   ├── اعضا / دعوت / مهمان
│   ├── رویداد چندخرجی (اختیاری)
│   └── تسویه + گزارش گروه
└── سازمان‌ها (Org Spaces) — N workspace تیمی
    ├── خرج سازمانی (company) + بودجه
    ├── پیش‌نویس / مطالبه خصوصی تا تأیید
    ├── خرید / اموال (فقط اینجا)
    └── export حسابدار + audit
```

### ۲.۲ هسته دامنه مشترک

| موجودیت | نقش |
|---------|-----|
| `Workspace` | کانتینر فضا با `template` و `spaceKind: personal \| group \| org` |
| `Membership` | نقش + سهم پیش‌فرض (`defaultShares`) |
| `Expense` | خرج با `visibility` و `splitMethod` |
| `ExpenseSplitLine` | سهم هر نفر |
| `ExpensePaymentLine` | پرداخت‌کننده(ها) |
| `ExpenseItem` *(جدید)* | خط فاکتور برای split آیتمی |
| `ExpenseItemAssignment` *(جدید)* | تخصیص آیتم به نفر(ها) |
| `Outing` / `ExpenseEvent` *(جدید)* | ظرف چندخرجی («بیرون‌رفتن») |
| `LedgerEntry` | دفترکل دوبل |
| `BalanceProjection` | مانده خالص |
| `Settlement` | تسویه ادعاشده/تأیید/اختلاف |
| `ExpensePeriod` | بازه گزارش/صورتحساب |
| `ReportExport` *(جدید)* | job واقعی CSV/Excel |

### ۲.۳ ماتریس visibility × فضا

| visibility | شخصی | گروهی | سازمانی |
|------------|------|-------|---------|
| `private` | پیش‌فرض همه خرج‌ها | یادداشت/خرج فقط من؛ اثر مانده = ۰ | پیش‌نویس یا مطالبه تا تأیید |
| `shared` | — / آینده: اشتراک دونفره | خرج جمعی دنگ | — |
| `company` | — | — (پنهان در UI گروهی) | خرج جاری تیم/پروژه |

---

## ۳. موتور سهم (جزئیات فنی)

### ۳.۱ روش‌های split

| کد | UX فارسی | کاربرد | وضعیت هدف |
|----|----------|--------|-----------|
| `equal` | مساوی بین این افراد | بستنی، تاکسی، اتاق مشترک | فاز ۱ — UX کامل |
| `amount` | مبلغ هر نفر | ناهار وقتی فقط جمع هر کس معلوم است | فاز ۱ — UX کامل |
| `percent` | درصدی | توافق درآمدی | فاز ۱ — در «بیشتر» |
| `shares` | سهمی / نسبت | خانواده ۲:۱؛ زوج در سفر | فاز ۱ + پیش‌فرض عضو در ۱ب |
| `itemized` *(جدید)* | بر اساس سفارش (فاکتور) | ناهار خط‌به‌خط | فاز ۱ب |
| `adjustment` *(اختیاری)* | مساوی + تعدیل | هدیه جزئی | فاز ۲ یا بعد ۱ب |

### ۳.۲ الگوریتم‌ها (قرارداد)

- **equal:** `allocateEqualSplit(total, participantUserIds)` — موجود در `@dang/contracts`.
- **amount:** جمع `splitLines.amount` باید دقیقاً `total` باشد.
- **percent:** basis points جمع = ۱۰۰۰۰.
- **shares:** وزن صحیح مثبت؛ توزیع متناسب + remainder.
- **itemized (جدید):**
  1. هر `ExpenseItem`: `amountMinor`, اختیاری `taxMinor`/`tipPool` در سطح expense.
  2. هر آیتم یک یا چند assignee؛ اگر چند نفر → زیر‌تقسیم equal یا shares روی همان آیتم.
  3. انعام/مالیات/تخفیف سطح فاکتور: توزیع متناسب با جمع آیتم‌های هر نفر یا equal بین شرکت‌کنندگان.
  4. خروجی نهایی: تولید `ExpenseSplitLine[]` و سپس همان مسیر ledger فعلی.
  5. Invariant: `sum(items) ± tax/tip/discount = expense.total`.

### ۳.۳ شرکت‌کنندگان

- `participantUserIds ⊆ membership(workspace)`.
- نفر غایب (رضا ناهار نخورد) در participants نیست → سهم صفر و در UI همان خرج دیده می‌شود ولی بدهکار نیست.
- برای `private`: دقیقاً یک participant = `createdBy` (یا paidBy طبق قاعده فعلی).

### ۳.۴ چندپرداخت‌کننده

- `paymentLines` موجود؛ UX فاز ۱ باید حداقل ۱ پرداخت‌کننده با مبلغ، و چندپرداخت‌کننده در «پیشرفته» را پشتیبانی کند.
- جمع paymentLines = total.

### ۳.۵ پیش‌نمایش

- کلاینت می‌تواند از تابع خالص contracts استفاده کند؛ API اختیاری `POST /expenses/preview-split` برای یکسان‌سازی سرور/کلاینت (توصیه فاز ۱).

---

## ۴. وضعیت فعلی (Baseline)

| حوزه | واقعیت کد | شکاف |
|------|-----------|------|
| Split بکند | `equal\|amount\|percent\|shares` | `itemized` نیست؛ UX گروهی ≈ فقط equal |
| Visibility | `shared\|private\|company` + فیلتر لیست | محصولی/IA سه‌فضایی نشده |
| Period | day/week/month/custom | `year` و export گزارش محصولی نیست |
| Ledger / settlement | Postgres + double-entry | simplify debts ضعیف/ناقص در UX |
| Auth | OIDC + local auth | middleware وب عمدتاً پرچم `dang_web_session` |
| PSP / OCR / Jobs | stub یا فوری completed | نقاط نمایشی — فاز ۰ |
| UI | mosaic hub + AppShell کلاسیک | دو پوسته؛ مخلوط شخصی/گروهی/سازمانی |
| Attachments | blob محلی واقعی | OCR ندارد (درست) |

---

## ۵. برنامه فازبندی (Release Train)

برآورد برای تیم ۲–۴ نفره؛ **تعهد زمانی نیست** — عبور با Definition of Done.

```text
فاز ۰ ──► فاز ۱ ──► فاز ۱ب ──► فاز ۲ ──► فاز ۳ ──► فاز ۴
ضد نمایشی   دنگ گروهی   آیتمی+رویداد  شخصی+گزارش  سازمانی   اتصال بیرونی
۳ فضا IA    بستنی/ناهار   فاکتور       export       بودجه
```

وابستگی سخت: ۰ قبل از همه؛ ۱ قبل از ۱ب؛ ۲ می‌تواند موازی انتهای ۱ب شروع شود اگر تیم جدا باشد؛ ۳ بعد از تثبیت visibility/roles؛ ۴ فقط با کلید واقعی.

---

## ۶. فاز ۰ — تثبیت صداقت، امنیت، اسکلت سه فضا

**هدف:** توقف بدهی اعتماد و آماده‌سازی IA بدون قابلیت جعلی.  
**بازه تقریبی:** ۱ اسپرینت (۱–۲ هفته)

### ۶.۱ Epics

| ID | Epic | اولویت |
|----|------|--------|
| P0-E1 | حذف/پنهان سطح UI برای PSP و OCR تا capability واقعی | P0 |
| P0-E2 | Session middleware واقعی (اعتبارسنجی نشست، نه پرچم) | P0 |
| P0-E3 | ناوبری سه فضا: `/me` · `/groups` · `/orgs` (یا معادل hub) | P0 |
| P0-E4 | یک App Shell واحد؛ حذف حس دو محصول mosaic/classic | P0 |
| P0-E5 | Jobs: Redis queue واقعی یا capabilities صادق بدون completed فوری جعلی | P0 |
| P0-E6 | پاکسازی copy انگلیسی/فنی از UI کاربر | P1 |

### ۶.۲ جزئیات فنی

**API**

- `GET /system/capabilities`: فیلدهای `payments.psp`, `ocr`, `antivirus`, `jobs.queue` دقیق از env/پیکربندی.
- اگر `psp !== 'zarinpal'|'stripe'|…` → کنترلر پرداخت checkout یا 404/410 و Web دکمه ندارد.
- JobsService: اگر صف نیست → وضعیت `unavailable` یا اجرای sync با برچسب صریح در capability؛ نه `completed` جعلی برای کارهای async واقعی.

**Web**

- `middleware.ts`: خواندن کوکی نشست HttpOnly و اعتبارسنجی از API (`/auth/me` یا introspect داخلی) / یا edge-compatible session verify.
- حذف اتکای صرف به `dang_web_session=1`.
- IA: سه ریشه ناوبری؛ ماژول‌های سازمانی فقط زیر `/orgs/:id`.
- یکپارچه‌سازی shell: یا hub فقط روتر است یا classic حذف می‌شود — یک chrome.

**DB**

- Migration اختیاری: ستون `workspace.space_kind` یا نگاشت قطعی از `template` → `personal|group|org`.
- ایندکس/constraint تغییر دامنه فقط اگر لازم.

**امنیت**

- رجوع به `docs/SECURITY.md` / hardening: session fixation، CSRF برای cookie، عدم dev-auth در prod.

### ۶.۳ معیار خروج (DoD)

- [x] هیچ دکمه پرداخت/OCR بدون capability واقعی در UI نیست.
- [x] دسترسی به hub بدون نشست معتبر رد می‌شود (middleware + session gate).
- [x] کاربر در سه فضای جدا فرود می‌آید؛ منوی سازمانی در گروه دوستان دیده نمی‌شود.
- [x] یک shell بصری در مسیرهای اصلی (hub).
- [x] capabilities با رفتار runtime یکی است (تست قرارداد + integrationsReady).

---

## ۷. فاز ۱ — فضای گروهی: دنگ واقعی (بستنی + ناهار مبلغی)

**هدف:** گروه دوستانه به‌عنوان محصول اصلی؛ مثال بستنی و ناهارِ مبلغی بدون اصطکاک.  
**بازه تقریبی:** ۲–۳ اسپرینت

### ۷.۱ Epics

| ID | Epic | اولویت |
|----|------|--------|
| P1-E1 | خانه گروه: اعضا + مانده + تایم‌لاین + CTA ثبت خرج | P0 |
| P1-E2 | جریان ثبت خرج زبان‌کاربری (مساوی / مبلغ هر نفر / درصد / سهم) | P0 |
| P1-E3 | انتخاب شرکت‌کنندگان + پیش‌نمایش سهم زنده | P0 |
| P1-E4 | سوییچ عمومی/خصوصی در همان جریان | P0 |
| P1-E5 | دعوت عضو + مهمان سبک + ایمیل واقعی در prod | P0 |
| P1-E6 | پیشنهاد تسویه حداقلی (simplify debts) | P1 |
| P1-E7 | چندپرداخت‌کننده در UI پیشرفته | P1 |
| P1-E8 | dispute/confirm settlement محصولی | P2 |

### ۷.۲ جریان UX هدف (گروه)

```text
خانه گروه
 → ثبت خرج
   → پرداخت‌کننده
   → مبلغ کل (تومان)
   → عمومی گروه | خصوصی من
   → روش: مساوی | مبلغ هر نفر | بیشتر…
   → انتخاب حاضران
   → پیش‌نمایش سهم هر نفر
   → ثبت
 → تایم‌لاین + به‌روز ماندن مانده
 → تسویه پیشنهادی
```

**بستنی:** عمومی + مساوی + همه/حاضران.  
**ناهار مبلغی:** عمومی + مبلغ هر نفر (علی ۳۰۰، سارا ۴۵۰، … رضا حذف).

### ۷.۳ جزئیات فنی

**Contracts (`packages/contracts`)**

- DTO ثبت خرج با برچسب‌های UX-neutral نگه داشته شود؛ Web localization جدا.
- `previewSplit(input) -> SplitPreview` اگر هنوز export عمومی ندارد، اضافه شود.
- تست واحد برای remainder equal و amount sum.

**API**

- `POST /workspaces/:id/expenses` — استفاده کامل از `splitMethod` + `splitLines` + `visibility` + `paymentLines`.
- `POST /workspaces/:id/expenses/preview` *(توصیه)*.
- `GET balances` — فیلتر بدون private دیگران (قبلاً شروع شده؛ تست regression).
- Invite: ارسال ایمیل وقتی mailer configured؛ وگرنه لینک + capability `mailer: stub|resend|smtp`.

**DB**

- معمولاً بدون migration بزرگ؛ در صورت نیاز: `membership.default_shares integer`.
- RLS: private expense فقط برای actor (و نقش admin صریح اگر تعریف شد — پیش‌فرض خیر در گروهی).

**Web**

- `FriendsGroupView` / خانه گروه جایگزین دوگانگی با finance سنگین برای قالب friends.
- کامپوننت `SplitComposer`: equal chips، amount inputs، preview list.
- صفر enum انگلیسی خام.

**امنیت**

- Idempotency-Key روی ایجاد خرج حفظ شود.
- عضویت اجباری برای participant/payer.

### ۷.۴ معیار خروج

- [x] کاربر جدید: ساخت گروه → دعوت → ثبت بستنی مساوی → ثبت ناهار مبلغی → مانده درست — مسیر محصولی با post بعد از draft.
- [x] رضا با سهم ۰ در ناهار در balances ناهار بدهکار نیست (تست contracts).
- [x] خرج private در لیست عضو دیگر نیست و net او را عوض نمی‌کند (تست API store).
- [x] پیش‌نمایش با همان allocator سرور (`preview-split` + items/tip/tax).
- [x] typecheck + تست contracts allocate سبز.

---

## ۸. فاز ۱ب — آیتمی فاکتور + رویداد چندخرجی + سهم پیش‌فرض

**هدف:** ناهار فاکتوری کامل + «بیرون‌رفتن» = چند خرج.  
**بازه تقریبی:** ۲ اسپرینت  
**وابستگی:** فاز ۱

### ۸.۱ Epics

| ID | Epic | اولویت |
|----|------|--------|
| P1b-E1 | مدل `ExpenseItem` + assignment + مالیات/انعام/تخفیف | P0 |
| P1b-E2 | UI فاکتور خط‌به‌خط + آیتم مشترک چندنفره | P0 |
| P1b-E3 | `Outing`/`ExpenseEvent` ظرف چندخرجی | P0 |
| P1b-E4 | `membership.defaultShares` + قالب family | P1 |
| P1b-E5 | تبدیل itemized → splitLines در یک تراکنش DB | P0 |

### ۸.۲ طرح داده (پیشنهادی)

```sql
-- migration جدید (شماره بعدی journal)
finance.expense_item (
  id uuid PK,
  expense_id uuid FK → expense ON DELETE CASCADE,
  line_no int,
  title text not null,
  amount_minor bigint not null, -- IRR minor
  notes text null
)

finance.expense_item_assignment (
  item_id uuid FK,
  user_id uuid,
  -- اگر چند نفر روی یک آیتم: weight یا equal ضمنی
  shares int not null default 1,
  primary key (item_id, user_id)
)

-- سطح expense: tip_minor, tax_minor, discount_minor (nullable columns)
-- یا جدول adjustment جدا

finance.outing (
  id uuid PK,
  workspace_id uuid,
  title text,
  occurred_on date,
  created_by uuid,
  ...
)
-- expense.outing_id nullable FK
```

`split_method` enum ← افزودن `itemized`.

### ۸.۳ API

- `POST /expenses` با `splitMethod: 'itemized'` و بدنه `items[]`.
- سرور: validate → allocate itemized → write items + split lines + ledger در یک tx.
- `GET /outings/:id` شامل expenses و aggregate balances همان outing.

### ۸.۴ معیار خروج

- [x] فاکتور نمونه ناهار با آیتم مشترک پیش‌غذا سهم‌ها درست است (تست واحد contracts).
- [x] `sum(splitLines) = total` با tip/tax (تست واحد).
- [x] Outing چندخرجی + aggregate API/UI موجود است (e2e میدانی جدا).
- [x] خانواده با `defaultShares` در UI گروه household قابل تنظیم است + تست سهم ۲:۱.

---

## ۹. فاز ۲ — فضای شخصی + گزارش جامع همه فضاها

**هدف:** شخصی به‌عنوان محصول مستقل؛ گزارش روز/هفته/ماه/سال/بازه + فایل واقعی.  
**بازه تقریبی:** ۲–۳ اسپرینت

### ۹.۱ Epics

| ID | Epic | اولویت |
|----|------|--------|
| P2-E1 | Personal workspace خودکار برای هر کاربر | P0 |
| P2-E2 | خانه من: ثبت خرج، دسته، بودجه ساده | P0 |
| P2-E3 | Period kind = `year` + موتور گزارش یکسان | P0 |
| P2-E4 | Export CSV/Excel واقعی (فایل download) | P0 |
| P2-E5 | دسته‌بندی خرج + فیلتر گزارش | P1 |
| P2-E6 | قبوض تکراری (recurring) شخصی/خانوادگی | P1 |
| P2-E7 | نمودار خلاصه بازه (از داده واقعی) | P2 |

### ۹.۲ جزئیات فنی

**DB**

- `period_kind` + enum value `year`.
- جداول `expense_category`, `expense.category_id`.
- `recurring_rule` (cron-like یا calendar monthly) + تولید draft expense.
- `report_export_job` یا استفاده از jobs واقعی با blob خروجی.

**API**

- `GET /workspaces/:id/reports?from&to&groupBy=day|category`
- `POST /workspaces/:id/reports/exports` → job id → `GET .../exports/:id/file`
- Personal space create-on-first-login.

**Web**

- مسیر `/me` کاملاً بدون UI تسویه گروهی.
- صفحه گزارش با preset: امروز / هفته / ماه / سال / دلخواه + دکمه دانلود فقط وقتی export آماده است.

### ۹.۳ معیار خروج

- [x] کاربر بدون گروه ارزش شخصی می‌بیند (personal workspace خودکار + post خرج).
- [x] دانلود CSV گزارش از API واقعی (تست قرارداد export موجود).
- [x] period سالانه در API و UI (+ preset امسال در گزارش).
- [x] هیچ عدد گزارش hardcoded نیست.

---

## ۱۰. فاز ۳ — فضای سازمانی جدا

**هدف:** تیم/شرکت کوچک بدون آلوده کردن UX دوستانه.  
**بازه تقریبی:** ۲–۳ اسپرینت

### ۱۰.۱ Epics

| ID | Epic | اولویت |
|----|------|--------|
| P3-E1 | بودجه زنده متصل به ثبت خرج company | P0 |
| P3-E2 | workflow تأیید هزینه | P0 |
| P3-E3 | private → company پس از تأیید (reimbursement) | P1 |
| P3-E4 | نمایش procurement/assets فقط در org | P0 |
| P3-E5 | export حسابدار + audit UI | P1 |
| P3-E6 | مرکز هزینه / پروژه (اختیاری) | P2 |

### ۱۰.۲ جزئیات فنی

- نقش‌ها: `org_admin`, `approver`, `member`, `viewer`.
- State machine هزینه سازمانی با audit trail.
- Budget ledger یا جدول `budget_bucket` با `remaining_minor` به‌روز در همان tx پست خرج.
- RLS سخت‌گیرانه per workspace.

### ۱۰.۳ معیار خروج

- [x] عضو عادی بدون تأیید نمی‌تواند company post کند (گیت نقش در `ExpensesService.post`).
- [x] ثبت خرج budget را کم می‌کند؛ UI از API می‌خواند.
- [x] کاربر گروه دوستان هیچ منوی خرید/اموال نمی‌بیند (فیلتر ماژول/quick actions).

---

## ۱۱. فاز ۴ — اتصال‌های بیرونی (فقط واقعی)

| قابلیت | شرط فعال‌سازی | رفتار بدون شرط |
|--------|----------------|-----------------|
| زرین‌پال / PSP | Merchant ID + callback verify + sandbox/prod | دکمه نیست |
| OCR رسید → پیشنهاد item | ارائه‌دهنده + worker صف | ورود دستی |
| AV اسکن | موتور واقعی | allow-list MIME + اندازه |
| تلگرام/بله/SMS | توکن | فقط ایمیل/نوتیف درون‌اپ |

هر اتصال: قرارداد در capabilities + تست integration با sandbox + سند RUNBOOK.

---

## ۱۲. الزامات غیروظیفه‌ای (همه فازها)

| موضوع | هدف |
|-------|-----|
| Idempotency | ایجاد خرج/تسویه/دعوت |
| RLS | صفر نشت cross-tenant در تست |
| Observability | trace روی مسیر خرج→ledger |
| عملکرد | ثبت خرج p95 هدف < ۲s در staging محلی معقول |
| دسترس‌پذیری | RTL، فونت فارسی، کنتراست، فوکوس کیبورد |
| کیفیت | typecheck + unit contracts + حداقل یک e2e مسیر طلایی هر فاز |
| PWA | فقط ویژگی‌های واقعی (offline draft موجود را حفظ؛ بدون ادعا) |

---

## ۱۳. معیارهای موفقیت محصول

| شاخص | هدف فاز ۱ | هدف فاز ۲ |
|------|-----------|-----------|
| زمان تا اولین خرج گروهی موفق | < ۱۰ دقیقه | < ۵ دقیقه |
| صحت مانده در سناریو بستنی+ناهار | ۱۰۰٪ تست طلایی | ۱۰۰٪ |
| قابلیت نمایشی در UI | ۰ | ۰ |
| Export گزارش قابل‌بازشدن | — | ۱۰۰٪ تطبیق با DB |
| تمایز سه فضا در first-click تست | ≥ ۸۵٪ | ≥ ۹۰٪ |

---

## ۱۴. ریسک‌ها و کاهش

| ریسک | کاهش |
|------|------|
| پیچیدگی آیتمی باعث تأخیر گروه ساده شود | فاز ۱ بدون itemized؛ ۱ب جدا |
| دو پوسته‌ای UI ادامه یابد | P0-E4 اجباری قبل از فیچر جدید |
| stub دوباره به UI برگردد | review بر اساس no-fake-data + capabilities |
| scope سازمانی زود وارد دوستانه شود | فیلتر ناوبری بر space_kind |
| مهاجرت enum split/period | migration + سازگاری خواندن مقادیر قدیم |

---

## ۱۵. ترتیب تأیید و اجرای پیشنهادی

| گزینه | دامنه | توصیه |
|-------|--------|--------|
| **A** | فقط فاز ۰ | اگر اعتماد/امنیت الان بحرانی است |
| **B (پیشنهادی)** | فاز ۰ + فاز ۱ | حداقل محصول دنگ قابل دفاع |
| **C** | ۰ + ۱ + ۱ب | پوشش کامل بستنی و ناهار فاکتوری |
| **D** | C + فاز ۲ | شخصی + گزارش/export |
| **E** | کامل تا ۳ | سازمانی |
| **F** | + فاز ۴ | فقط با کلیدهای واقعی سرویس |

---

## ۱۶. پیوست — سناریوی پذیرش طلایی (Gherkin خلاصه)

```text
Given گروه ۴ نفره علی، سارا، رضا، مینا
When علی خرج «بستنی» ۴۰۰۰۰۰ عمومی مساوی بین هر ۴ ثبت می‌کند
Then سهم هر نفر ۱۰۰۰۰۰ و علی طلبکار ۳۰۰۰۰۰ خالص از این خرج است

When سارا خرج «ناهار» ۱۱۵۰۰۰۰ عمومی با مبلغ:
  علی ۳۰۰۰۰۰، سارا ۴۵۰۰۰۰، مینا ۴۰۰۰۰۰، رضا غایب
Then رضا در این خرج بدهکار نیست و جمع سهم = کل

When علی یک خرج خصوصی «سوغاتی» ثبت می‌کند
Then سارا آن را در لیست نمی‌بیند و مانده‌اش عوض نمی‌شود

When بازه «امروز» گزارش گرفته می‌شود و CSV دانلود می‌شود
Then ردیف‌ها با خرج‌های عمومی visible برای درخواست‌کننده یکی است
```

---

## ۱۷. کنترل تغییرات

| نسخه | تغییر |
|------|--------|
| 2.0 | سه فضای جدا؛ موتور سهم بستنی/ناهار؛ فاز ۰/۱/۱ب/۲/۳/۴؛ جزئیات فنی DB/API/Web؛ ادغام ضدنمایشی و گزارش |

**اجرا شروع نمی‌شود تا مالک محصول یکی از گزینه‌های بخش ۱۵ را تأیید کند.**
