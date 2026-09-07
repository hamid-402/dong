# تجمیع «دنگ همکاری ۲.۰» با سامانه فعلی — نقشهٔ قفل‌شدهٔ اجرا

**وضعیت:** 🟢 **انجام‌شده** — موج‌های ۰–۶ روی پایهٔ کد قفل و تحویل شده‌اند.  
**تأیید مالک:** ۱۴۰۴/۰۶/۱۶ — «قوانین اسناد مرجع + شروع اجرا»  
**آخرین قفل polish:** سیم‌کشی UI باقی‌مانده (cost center در فرم خرج، FSM بازپرداخت، بودجه دسته، سیاست خرج، digest prefs، پیوند add-on) بدون ادعای live برای FX/شارژ/OCR.  
**منابع ورودی:**  
- محصول/معماری: [DONG-2.0-PRODUCT.md](./DONG-2.0-PRODUCT.md)  
- نقشه راه + حاکمیت: [DONG-2.0-ROADMAP.md](./DONG-2.0-ROADMAP.md)  
- واقعیت کد: monorepo فعلی (Shell `/w`، ledger، RBAC، capabilities، …)
- موجودی live/infra: [DONG-2.0-FINISH.md](./DONG-2.0-FINISH.md)

**قانون طلایی:** برآیند = (برتری کد) ∪ (برتری سند). حرکت فقط رو به جلو؛ حذف قابلیت از هیچ‌کدام ممنوع است مگر جایگزینی معادل کامل و مهاجرت صریح.

در تعارض Desktop markdown خام با این فایل: **همین فایل + کد** مقدم است مگر این سند صریحاً به‌روز شود.

---

## ۰) ماتریس تصمیم (چگونه قفل می‌کنیم)

| وضعیت | عمل در برآیند |
|--------|----------------|
| کد **کامل‌تر / حرفه‌ای‌تر** از سند | کد حفظ؛ سند باید واقعیت را بپذیرد |
| سند **طراحی / معماری / منطق بهتر** دارد | منطق/طراحی سند روی پایهٔ کد پیاده می‌شود (additive) |
| معادل با نام متفاوت | فقط **نگاشت نام**؛ rename اجباری DB/API در موج‌های اول ممنوع |
| سند چیزی می‌گوید که کیفیت فعلی را پس می‌زند | **خطوط قرمز** (§۵) — اجرا نمی‌شود |

---

## ۱) آنچه سامانه از اسناد جلوتر / بهتر است (حفظ اجباری)

### ۱.۱ امنیت، اعتماد، Honesty
- Capabilities واقعی (`SystemCapabilities`، stubs/providers/persistence) — قانون no-fake-data
- Postgres fail-closed + `DANG_REQUIRE_POSTGRES`
- MFA TOTP + recovery، OIDC، session cookie HttpOnly مشترک (`session-cookies`)
- `WorkspaceAccessService` مرکزی
- نقش‌های غنی‌تر: `admin`, `approver`, `buyer`, `asset_custodian` علاوه بر owner/finance/member/auditor — **حذف نمی‌شوند**
- Rate-limit با HTTP **۴۲۹** واقعی

### ۱.۲ دامنه مالی عمیق‌تر از چک‌لیست خام سند
- دفترکل دوطرفه + قید تراز journal (`0031`)
- ۵ روش تقسیم + itemized tip/tax/discount + `paymentLines`
- دورهٔ هزینه + صورتحساب عضو با workflow (pending_approval → disputed/approved → issued → paid) و `sharedTotal` / `privateTotal`
- دفتر روزانه مصرف — در سند ۲.۰ ذکر نشده؛ **حفظ کامل**
- فضای شخصی: حساب/انتقال/بودجه/هشدار/export + overview چندفضایی
- عمودهای سازمانی موجود: خرید، تجهیزات، پیشنهاد، شراکت، زرین‌پال (stub در capabilities)
- `suggestMinimalSettlements` در contracts + استفاده در UI گروه/دفتر
- مسیر reimbursement فعلی: approve private → company (expenses) — پایهٔ گسترش، نه حذف

### ۱.۳ IA و محصول
- Shell v2 روی `/w/[slug]/…` — نه mosaic Hub به‌عنوان مسیر اصلی
- Redirect کلاسیک/`/hub` → `/w`
- متریک از audit واقعی؛ personal/group/org بر اساس `spaceKind`

### ۱.۴ کیفیت و تحویل
- CI سخت: a11y، audit، coverage، license، line-budget (محدود به views)، gitleaks
- e2e: login، a11y، keyboard، expense→settlement، PWA
- ADRهای زنده؛ الگوی thin controller

**نتیجه:** بخش‌هایی از اسناد که هنوز Hub-اول، skip نرم CI، یا «فقط ۵ نقش» می‌گویند با این لیست هم‌تراز می‌شوند — کد به عقب برنمی‌گردد.

---

## ۲) آنچه اسناد از سامانه بهتر دارند (اجرای اجباری روی پایهٔ کد)

این‌ها **طراحی / معماری / منطق** سندند که کد ناقص یا ضعیف‌تر است؛ در برآیند باید پیاده شوند — بدون حذف موارد §۱.

### ۲.۱ منطق دامنه (اولویت محصول)
| # | برتری سند | واقعیت کد امروز | تصمیم قفل |
|---|-----------|-----------------|-----------|
| D1 | **Add-on شخصی داخل گروه** به‌عنوان موجودیت جدا + FSM `pending_ack → confirmed \| disputed` + تأیید دوطرفه وقتی برای دیگری ثبت می‌شود | فقط `visibility: private` + `privateTotal`؛ بدون ack صریح | جدول/وضعیت additive (`personal_addon_charge` یا kind روی expense) — **private فعلی حذف نمی‌شود** |
| D2 | Invariant صریح و تست‌شده: `invoice_total = Σ shared + Σ addon` در contracts (+ بعداً DB) | `sharedTotal`/`privateTotal` هست؛ invariant قرارداد رسمی ضعیف | تست + تابع pure در contracts؛ سپس CHECK/trigger |
| D3 | قانون ۹: حداقل دو مدیر مالی فعال برای گروه/خانواده/سازمان | چند `finance` ممکن است؛ enforce سخت نیست | چک اپ سخت (+ ترجیحاً constraint) روی spaceKindهای غیرشخصی |
| D4 | Guest برای رویداد کوتاه | ندارد | نقش/عضویت موقت additive بعد از قلب محصول |
| D5 | دسته سلسله‌مراتبی `parent_id` | `expense_category` تخت (name/slug) | ستون `parentId` اختیاری + RLS همان PR |
| D6 | پیوند add-on به هزینهٔ مشترک (`linked_shared_expense_id`) | ندارد | فیلد اختیاری روی موجودیت add-on |
| D7 | سه قانون طلایی debt-simplification به‌عنوان تست invariant + UX «پیشنهاد مسیر تسویه» درجه یک | الگوریتم greedy هست؛ API/فرمان درجه یک و تست سه قانون ناقص | API + تست سه قانون + UI پیشنهاد — بدون حذف claim/confirm/dispute |

### ۲.۲ معماری و موتورها
| # | برتری سند | واقعیت کد | تصمیم قفل |
|---|-----------|-----------|-----------|
| A1 | Worker cron `recurrence-tick` + `auto_confirm` true/false (ثبت خودکار vs یادآوری تأیید) | `recurring_rule` + `run-due` دستی/API | job worker واقعی + DLQ؛ rule فعلی گسترش می‌یابد نه بازنویسی از صفر |
| A2 | نسخه‌بندی قانون تکرار (تغییر مبلغ از تاریخ X بدون خراب کردن تاریخچه) | ویرایش rule فعلی ضعیف‌تر است | additive: version/effectiveFrom در موج D+ |
| A3 | سه‌گانهٔ اجباری Migration + RLS + Invariant برای هر entity مالی جدید | در ledger قوی است؛ برای فیچر جدید باید formal شود | قانون ۳ roadmap = Definition of Done هر PR مالی |
| A4 | Feature-flag محصولی (`ENABLE_ADDON_*`, `ENABLE_RECURRENCE`, …) برای مرج امن | عمدتاً capabilities/env | flags اضافه؛ capabilities و MFA خاموش‌شدنی نمی‌شوند |
| A5 | لایهٔ BI: View → Materialized (با شواهد) → CQRS سبک | گزارش‌ها پراکنده‌اند؛ بدون مسیر رشد صریح | ترتیب سند؛ Materialized فقط با perf evidence |
| A6 | ماژول‌بندی واضح categories / recurrence / approvals | منطق داخل expenses/reports/billing پخش است | استخراج تدریجی thin modules — بدون شکستن API موجود |

### ۲.۳ طراحی UX / IA (روی Shell فعلی `/w`)
| # | برتری سند | واقعیت کد | تصمیم قفل |
|---|-----------|-----------|-----------|
| U1 | تفکیک بصری کامل فرم «هزینه مشترک» vs «اضافه شخصی» | یک جریان expense با visibility | دو CTA/فرم متمایز روی `/w` — finance-view حذف نمی‌شود |
| U2 | فرم مشترک مرحله‌ای (مبلغ → اعضا → روش → دسته → پیش‌نمایش سهم) | فرم غنی ولی نه الزاماً wizard سند | wizard additive یا مراحل داخل فرم موجود |
| U3 | یک CTA غالب در هر صفحه | بعضی صفحات چند اکشن هم‌وزن | اصل طراحی برای صفحات جدید و refactor نرم |
| U4 | «مرکز تأیید» واقعی: صف اکشن‌های من (add-on، سقف، recurrence) | اعلان/نوتیف هست؛ صف یکپارچه نیست | صف از API واقعی — **بدون عدد جعلی** |
| U5 | دشبورد BI سه‌لایه (Glance / Trend / Breakdown) | متریک و گزارش جزئی | additive زیر `/w` یا more |
| U6 | اصول UI مشترک: Amount / Field / Modal / Table + a11y همان PR | تا حدی رعایت شده | اجباری برای هر صفحهٔ جدید (قوانین ۸ سند + §۸ محصول) |

### ۲.۴ خانواده / سازمان / رشد (بعد از قلب)
| # | برتری سند | تصمیم قفل |
|---|-----------|-----------|
| F1 | حریم per-item خانواده | additive روی `household` |
| F2 | Allowance فرزند | additive |
| F3 | Approval workflow step + سقف تأیید | گسترش روی `approver` / pending_approval موجود |
| F4 | Cost Center / پروژه | entity جدید + RLS |
| F5 | Reimbursement با FSM جدا | گسترش مسیر private→company فعلی به FSM کامل |
| F6 | Expense Policy (مثلاً رسید اجباری بالای X) | additive سازمانی |
| F7 | اعلان چندکاناله + خلاصه دوره‌ای ایمیل | روی notification موجود؛ mailer stub در capabilities صادق بماند |
| F8 | Export کامل + Data Portability + Import Excel onboarding | بعد از E؛ CSV شخصی هست → گسترش |
| F9 | مدل Freemium (هسته رایگان، عمق پولی) | تصمیم محصولی؛ billing فعلی پایه — فاز تجاری جدا |
| F10 | Guest، OCR پیشرفته، چندارزی کامل | بعد از موج‌های قلب؛ currency از قبل در مدل هست |

### ۲.۵ حاکمیت تحویل (از roadmap — بهتر از وضعیت پراکنده)
| # | قانون سند | تصمیم قفل |
|---|-----------|-----------|
| G1 | قانون ۵: line-budget روی کل `components/**` | موج ۰ قبل از UI زیاد |
| G2 | قانون ۱–۲: بدون skip بی‌صدا؛ scope گیت صریح | حفظ CI سخت فعلی + گسترش |
| G3 | قانون ۴: سند و کد هم‌PR | اجباری |
| G4 | قانون ۶: بدون UI فقط | اجباری (هم‌راستا با no-fake-data) |
| G5 | قانون ۷: EXPLAIN/آستانه برای BI | با موج E |

---

## ۳) نگاشت نام (بدون بازنویسی اجباری)

| اصطلاح سند ۲.۰ | واقعیت کد | سیاست |
|----------------|-----------|--------|
| Treasurer / مادرخرج | `finance` + `isFinanceManagerRole` (owner/admin/finance) | نگاشت؛ alias UI/docs مجاز |
| Viewer | `auditor` + `isReadOnlyRole` | نگاشت |
| Guest | — | افزودن بعدی (D4) |
| `friends_group` | `friends_family` → spaceKind `group` | نگاشت template |
| `family` | `household` | نگاشت؛ حریم per-item بعداً (F1) |
| `organization` | `small_team` / `project_partners` / `construction` → `org` | نگاشت؛ ۳ قالب حفظ |
| Shared expense | `visibility: "shared"` | نگاشت |
| Personal add-on | نزدیک: private + privateTotal | تکمیل با D1 — حذف private ممنوع |
| Pure personal | workspace `personal` + `personal.*` | هر دو سطح حفظ |
| Feature flags سند | capabilities + env | flags محصولی اضافه؛ capabilities حفظ |

---

## ۴) نقشهٔ قفل‌شدهٔ اجرا (برآیند نهایی)

هر موج: (الف) برتری کد §۱ را نشکند، (ب) برتری سند همان موج را پیاده کند، (ج) flag/capabilities برای UI ناتمام، (د) بدون دکمهٔ جعلی.

```
موج ۰  حاکمیت + هم‌ترازی docs          [پیش‌نیاز]
  → موج ۱  فاز A باریک (مدل/invariant) [پیش‌نیاز قلب]
  → موج ۲  فاز B (add-on + فرم‌ها)     [قلب تمایز]
  → موج ۳  فاز C (simplify درجه یک)    [قلب]
  → موج ۴  فاز D (recurrence worker)   [می‌تواند موازی نرم با ۳]
  → موج ۵  فاز G سبک (مسیر/تب additive روی /w)
  → موج ۶  فاز E سپس F (BI → خانواده/سازمان)
```

### موج ۰ — حاکمیت (سند بهتر در فرآیند)
1. گسترش `view-line-budget` به `apps/web/src/components/**` (G1)
2. هم‌ترازی `docs/IA.md` و اسناد کهنه با `/w` و CI فعلی (نه برگرداندن Hub)
3. ADR کوتاه: debt-simplification = greedy (سه قانون طلایی)
4. تعریف env flags: `ENABLE_ADDON_ACK`, `ENABLE_RECURRENCE_WORKER`, … — بدون خاموش کردن MFA
5. این سند + PRODUCT/ROADMAP لینک‌شده در README (انجام‌شده)

### موج ۱ — A باریک (منطق مدل سند روی پایهٔ موجود)
6. پایدارسازی نگاشت template → spaceKind (بدون شکستن ۶ قالب؛ بدون enum چهارتایی اجباری یک‌شبه)
7. `parentId` روی `expense_category` (D5) + RLS
8. قانون حداقل دو finance فعال برای group/org/household (D3)
9. Invariant `invoice_total = shared + private/addon` در contracts + تست (D2)
10. اسکلت موجودیت add-on (جدول یا kind) + RLS — هنوز UI کامل لازم نیست؛ flag خاموش پیش‌فرض

### موج ۲ — B (قلب سند؛ طراحی UX سند)
11. FSM add-on: `pending_ack → confirmed | disputed` + تأیید وقتی برای دیگری ثبت شود (D1, D6)
12. فرم/CTA متمایز add-on vs shared؛ wizard مرحله‌ای shared در حد ممکن (U1, U2)
13. e2e: add-on دیگری بدون تأیید در صورتحساب قطعی دیده نمی‌شود
14. Audit روی entity جدید

### موج ۳ — C
15. API درجه یک «پیشنهاد ساده‌سازی بدهی» روی `suggestMinimalSettlements` (D7)
16. تست سه قانون طلایی
17. UI پیشنهاد مسیر تسویه — claim/confirm/dispute حفظ

### موج ۴ — D
18. ✅ Worker `recurrence.tick` + `auto_confirm` (ثبت خودکار؛ مسیر یادآوری به‌شکل draft) (A1)
19. ✅ `asOf` برای زمان شبیه‌سازی‌شده + retry/DLQ
20. نسخه‌بندی rule در صورت نیاز (A2) — می‌تواند D+ باشد

### موج ۵ — G سبک (IA سند روی Shell کد)
21. تب/زیرمسیر additive: add-on، صورتحساب، تکرار، گزارش، صف تأیید واقعی (U4) زیر `/w` یا `more`
22. a11y همان PR (U6)؛ یک CTA غالب در صفحات جدید (U3)
23. **ممنوع:** بازسازی mosaic Hub

### موج ۶ — E سپس F ✅
24. BI: SQL View → آستانه perf → Materialized فقط با شواهد (A5, U5)
25. بودجه/هشدار دسته گروهی؛ مقایسه دوره‌ای
26. F1–F6 خانواده/سازمان؛ سپس F7–F8؛ Guest/OCR/FX/Freemium طبق اولویت محصول (F9–F10)

### صریحاً بعد از قلب / خارج از شروع فوری
- Guest، OCR marketplace، چندارزی کامل، Approval Center با عدد جعلی، rename overnight `expense`→`shared_expense`، بازسازی Hub

---

## ۵) خطوط قرمز رگرسیون

| اقدام ممنوع | چرا |
|-------------|-----|
| بازگرداندن mosaic Hub به‌عنوان IA اصلی | `/w` و e2e را می‌شکند |
| حذف نقش‌های approver/buyer/asset_custodian | کد غنی‌تر از سند ۵نقشی است |
| جایگزینی capabilities با badge ثابت یا flag که MFA را خاموش کند | honesty + امنیت |
| حذف دفتر روزانه / خرید / پیشنهاد / شراکت | قابلیت واقعی کاربر |
| بازنویسی یک‌شبه `expense` → `shared_expense` | دو سیستم موازی خطرناک |
| soft-skip دوبارهٔ a11y/audit | پسرفت CI |
| صفحهٔ مرکز تأیید با شمارش جعلی | no-fake-data — صف باید از API واقعی باشد |
| حذف memory store در dev بدون `DATABASE_URL` | لوکال/تست؛ fail-closed برای prod جداست |
| پیاده‌سازی «ظاهری» add-on بدون FSM/API/تست | نقض قانون ۶ سند و no-fake-data |

---

## ۶) Definition of Done برای «برآیند تجمیع‌شده»

1. همهٔ موارد §۱ در مسیر اصلی کار می‌کنند.  
2. موارد D1–D3، D5، D7 و A1 حداقل تا پایان موج ۴ پیاده و تست شده‌اند.  
3. UX U1–U2 حداقل برای add-on/shared روی `/w` دیده می‌شود (با flag تا پایدار شود).  
4. اسناد داخل `docs/` با کد هم‌خوان‌اند (نام‌ها، IA، نقش‌ها).  
5. هیچ PRی برای «نزدیک شدن به متن خام سند» چیزی از §۱ را حذف نکرده است.

---

## ۷) چک‌لیست تأیید مالک محصول

- [x] §۱ (حفظ سامانه) پذیرفته شد  
- [x] §۲ (برتری اسناد برای پیاده‌سازی) پذیرفته شد  
- [x] §۴ ترتیب موج‌ها قفل است  
- [x] §۵ خطوط قرمز پذیرفته شد  
- [x] اجازهٔ شروع از **موج ۰** صادر شد  

### پیشرفت موج‌ها

| موج | وضعیت |
|-----|--------|
| ۰ حاکمیت | ✅ line-budget=`components/**` · ADR greedy · productFlags · IA=/w |
| ۱ A باریک | ✅ parentId · addon table+RLS · invoice invariant · Law 9 invite quorum |
| ۲ B add-on | ✅ API+FSM+RLS · UI گروه/صفحه پشت `ENABLE_ADDON_ACK` |
| ۳ C simplify | ✅ API suggestions + simplify-claims · UI گروه پشت flag |
| ۴ D recurrence | ✅ worker + auto_confirm + asOf + DLQ |
| ۵ G مسیرهای /w | ✅ invoices · recurring · addons در More + a11y paths |
| ۶ E/F | ✅ کامل: زیرساخت/قابلیت‌های F با مرز live و infra-only در `DONG-2.0-FINISH.md` |

---

### جزئیات موج ۶ (E سپس شروع F)

- BI با VIEW سادهٔ `finance.v_expense_posted_monthly` شروع شد؛ materialized view فقط پس از شواهد `EXPLAIN`.
- مقایسهٔ دو دوره با API و پاسخ واقعی، پشت `ENABLE_BI_COMPARE`.
- F4 مرکز هزینه: جدول + RLS اجباری + store حافظه/Postgres + API و UI سازمانی، پشت `ENABLE_COST_CENTER`.
- F1 حریم آیتم خانواده: `audience=finance_and_creator` برای پنهان‌کردن از اعضای دیگر و دسترسی creator/مدیر مالی.
- F2 سقف عضو: `finance.member_allowance` با RLS اجباری، store حافظه/Postgres، مصرف واقعی خرج‌های posted و UI فقط برای مدیر مالی، پشت `ENABLE_ALLOWANCE`.
- F6 سیاست خرج: `finance.workspace_expense_policy` با RLS اجباری؛ آستانهٔ سازمانی server-side `requiresApproval` را فعال می‌کند و endpoint تأیید واقعی پشت `ENABLE_EXPENSE_POLICY` است.
- F10 مهمان موقت: نقش `guest` به enum/قرارداد/دعوت افزوده شد؛ مانند حسابرس حق mutation مالی ندارد ولی shared و private خود را می‌بیند.
- U4 مرکز تأیید: صف واقعی add-on، صورتحساب عضو و خرج policy؛ در حالت خالی `[]` و UI بدون شمارندهٔ ساختگی، پشت `ENABLE_APPROVAL_QUEUE`.
- `costCenterId` اختیاری در قرارداد پیش‌نویس هزینه و فرم ثبت خرج (وقتی `productFlags.costCenter` و مراکز فعال وجود دارند) سیم‌کشی شد.
- تکمیل 0038: FSM بازپرداخت، receipt enforcement، بودجه دسته، نسخه‌بندی recurrence،
  جدول FX بدون ادعای conversion، CSV import، digest opt-in، plan infra و approval steps.
- UI polish نهایی: ایجاد/گذار بازپرداخت، ساخت بودجه دسته، تنظیم سیاست خرج، ترجیح digest در حساب، پیوند اختیاری add-on به خرج مشترک.
- مرز قابلیت‌های live و infra-only و flagهای خاموش پیش‌فرض در `DONG-2.0-FINISH.md` ثبت شده است.

---

*آخرین به‌روزرسانی: موج‌های ۰–۶ + polish UI کامل؛ بخش‌های conversion/charging/OCR صریحاً infra-only هستند.*
