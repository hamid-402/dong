# معماری اطلاعات (IA) — دنگ همکاری

وضعیت: اجرایی (مسیر canonical = Shell `/w` — هم‌تراز با Dong 2.0 تجمیع)

## قانون طلایی

هیچ قابلیت، route، منو یا دکمه حذف نمی‌شود. فقط سلسله‌مراتب شفاف می‌شود (Primary / Secondary / More).  
اسناد ۲.۰ و Hub قدیمی **منبع تاریخی**اند؛ مسیر محصول فعلی `/w/[slug]/…` است.

## قوانین مرجع اجرا (از نقشه راه ۲.۰)

1. بدون skip بی‌صدای گیت CI  
2. scope هر گیت صریح باشد (مثلاً line-budget روی `components/**`)  
3. entity مالی جدید = Migration + RLS + Invariant test  
4. سند و کد هم‌PR  
5. بودجه خط برای همهٔ کامپوننت‌ها  
6. بدون UI فقط / بدون دکمهٔ جعلی  
7. مسیر تشخیص کندی برای تجمیع‌های جدید  
8. a11y همان PR برای صفحهٔ جدید  
9. حداقل یک مدیر مالی برای فضاهای غیرشخصی (پس از bootstrap؛ نفر دوم اختیاری است)

جزئیات برآیند: [DONG-2.0-RECONCILIATION.md](./DONG-2.0-RECONCILIATION.md)

## مدل ذهنی

کاربر همیشه در یکی از این سه زمینه است (`spaceKind` از template):

| زمینه | ریشه canonical | کار اصلی (Primary) |
|--------|----------------|---------------------|
| شخصی | `/w/[slug]/…` با template `personal` | ثبت خرج / منابع شخصی |
| گروه | `/w/[slug]/…` با `friends_family` / `household` | خرج مشترک + مانده + add-on |
| سازمان | `/w/[slug]/…` با قالب‌های org | تأیید، بودجه، خرید |

لایهٔ سراسری: workspace switcher، اعلان، پروفایل، ابزارها (More).

## Chrome

- **Shell v2 — دو حالت هدر**
  - **Primary** (`isShellPrimaryPath`): خانهٔ فضا / خرج‌ها / space / more ریشه، `/spaces`، `/home`، `/account` ریشه — تب‌های حوزه (خانه · شخصی · گروهی · ساختمان · سازمان) + ابزارها
  - **Sub**: صفحات عمیق‌تر (`/settlements`، `/members`، `/approvals`، more با `?folder=`، …) — بازگشت + مسیر + جستجو
- **خروج از فضا:** روی primary و sub وقتی مسیر `/w/…` است، کنترل «خروج از فضا» به `/spaces?kind=…` می‌رود (نه فقط بازگشت داخل همان فضا). روی موبایل در sub به صورت فشرده کنار دکمهٔ بازگشت است؛ لینک «فضاهای من» از عرض ≈۷۲۰px در انتهای هدر دیده می‌شود.
- **تب‌های حوزه (kind):** همیشه فهرست همان حوزه را باز می‌کنند (`/spaces?kind=`). داخل workspace، تب هم‌نوع فقط به‌صورت `current-realm` علامت می‌خورد — `aria-current=page` نیست تا با «صفحهٔ جاری» اشتباه نشود.
- **مسیر صفحه:** `ShellPageTrail` = بازگشت (+ breadcrumb وقتی `backOnly` نباشد)؛ عنوان/مسیر در `ShellHeaderWayfinding`
- **بدون strip عملیات زیر عنوان:** `OperationsModuleHeader` بازنشسته است؛ سوییچ بخش‌ها از تب Shell / ابزارها / Palette / CTA عنوان صفحه
- **دسته‌بندی واحد دامنه** برای ابزارها و جست‌وجو: مالی · خرید · اعضا · نظارت · تنظیمات (`domainGroupedNav` / `spaceNav`)
- **سه لایه ناوبری موزاییکی (URL-as-state):** دامنه (`?folder=`) → زیرشاخه (`&group=`) → مقصد نهایی؛ Escape یک لایه عقب
- **تب پایین (موبایل/تبلت):** خانه · خرج‌ها · فضا · ابزارها روی `/w/[slug]/…`
- خانه = launcher دامنه + مانده زنده؛ مرکز تأیید با badge واقعی در هدر وقتی صف خالی نیست
- مسیرهای classic و `/hub/*` با redirect به `/w` حفظ bookmark می‌مانند

## نقشه رستم (ناوبری / خانه / صداقت)

- R2: leave-space روی sub-chrome + معنای صادق kind tabs.
- R4: viewport اول خانه = mosaic (discovery) + briefing (urgency)؛ پول/ops/فعالیت زیر «جزئیات». chrome: تمایز error vs empty برای capabilities و اعلان‌ها. DoD: `e2e/a11y-themes.spec.ts` (۵ تم) · `e2e/home-mobile-fold.spec.ts`.
- R6: `A11Y_REQUIRE_FINANCE=1` + API در CI؛ visual hard با `hashFiles(login-chromium-linux.png)` پس از commit baseline.
- R7: ABAC `rbac_abac_v5` + UI سقف تأیید جانشین (`approvalCapMinor`).
- R9: persistence chrome از همهٔ storeهای capabilities (مختلط صادق)؛ `ProviderStubBadges` روی خانه/مالی (+ FX وقتی conversionLive خاموش)؛ digest بدون ادعای آخرین ارسال؛ لینک Depth فقط وقتی provider زنده؛ کلیدهای `partners.*` / `procurement.*` در fa+en.
- SoT وضعیت: [`STATUS.md`](./STATUS.md) · امنیت: [`security/PENTEST-REMEDIATION-TRACKER.md`](./security/PENTEST-REMEDIATION-TRACKER.md).

## خانه و مسیر canonical

| کار | URL |
|-----|-----|
| فضای کاری (خانه / اتاق عملیات) | `/w/[slug]` |
| نمای فضا (من / گروه / سازمان) | `/w/[slug]/space` |
| مالی / خرج‌ها | `/w/[slug]/expenses` (تسویه `/settlements` · صورتحساب کلی دوره `/invoices` · ریز حساب اعضا `/statements` · تکرار `/recurring`) — فیلتر لیست خرج: `visibility`/`from`/`to`/`catalogItemId` (با `providers.catalog`) |
| مالی سازمان (Wave F) | `/w/[slug]/org-finance` — فقط وقتی flagهای مربوط در capabilities روشن باشد |
| add-on / تأیید | `/addons` · `/approvals` — فقط با `addonAck` / `approvalQueue`؛ تأیید همچنین از badge هدر |
| دفتر روزانه | از تب‌ها / More همان slug |
| دعوت / اعضا | `/w/[slug]/members` — لینک دعوت: owner/admin · افزودن شناسه: +finance |
| پروفایل / تنظیمات | Shell More / settings |

مسیرهای `/hub/…` و classic → redirect به `/w` (حذف قابلیت نیست).
Bookmarkهای `#settlement-panel` / `#period-invoice-panel` / `#reports-panel` روی `/workspaces`
به بخش‌های جداگانهٔ `/settlements`، `/invoices` و `/recurring` نگاشت می‌شوند.

## سفرهای مشتری

### A — گروه دوستان
ورود → `/w/[slug]/space` → ثبت خرج مشترک / add-on → مانده → پیشنهاد ساده‌سازی بدهی → تسویه

### B — شخصی
ورود → فضای personal → منابع و بودجه → گزارش

### C — سازمان
ورود → خانه org → بودجه / تأیید → خرج؛ خرید از More

### D — رشد / دعوت و دوستان (W7)
`/onboarding` → ساخت فضا → `/w/[slug]/members` (لینک دعوت + کپی) → `/invite?token=` (نشست واقعی) → خانه فضا · اختیاری: `/account/friends` (lookup / تطبیق مخاطبین / دعوت به فضا) · `/whats-new` از STATUS

پایلوت میدانی: [`docs/ops/PILOT.md`](./ops/PILOT.md)

## مدل ۶ نقش (سطح محصول)

Enum دیتابیس ۱۰ مقدار می‌ماند (additive). **سطح دعوت/UI** چهار نقش هسته + دو پیشرفته است:

| سطح | نقش‌ها | نمایش در دعوت |
|------|--------|----------------|
| هسته | مادرخرج · ادمین · عضو · مهمان | همیشه |
| پیشرفته | تأییدکننده · خریدار | فقط با `approvalQueue`/`expensePolicy` یا ماژول خرید/دارایی |
| پیشرفته (ناظر) | auditor | فضاهای غیرشخصی؛ شل گزارش‌خوان |

- ساخت **لینک دعوت**: فقط `owner` / `admin`
- **افزودن با شناسه/نام‌کاربری**: `owner` / `admin` / `finance` (مادرخرج)
- صف تأیید UI: فقط `EXPENSE_APPROVER_ROLES` (owner/admin/finance/approver)
- مهمان/ناظر: `roleAllowsNavKey` + `roleBlocksWorkspacePage` در nav و Gate
- `roleNavProfile` / `resolveUiPersona`: شل شش‌گانه (عضو/تأیید/خریدار محدود؛ مالک/مادرخرج کامل)
- `personaHomeSpec(role, spaceKind)`: عنوان/CTA/پنل‌های خانه برای گروه · سازمان · ساختمان
- نقش membership در **منوی شل · خانه · ابزارها · command palette** واقعاً پاس می‌شود (`useWorkspaceMembershipRole`)
- بنر دائم مهمان/ناظر + نشانگر جانشین (`PersonaShellBanner` در `WorkspacePageFrame`)
- منبع قرارداد: `@dang/contracts` → `role-surface` / `uiInviteRoleOptions` / `roleNavProfile`

## قوانین ناوبری UI

1. هر صفحه حداکثر یک CTA رقابتی در viewport اول (اصل سند ۲.۰).  
2. فرم «هزینه مشترک» و «اضافه شخصی / add-on» باید بصری متمایز باشند.  
3. Quick actions: Primary + Secondary (لینک‌های قبلی reachable می‌مانند).  
4. ماژول خرید/اموال فقط وقتی template اجازه دهد.  
5. یافتن و آمار فقط از دادهٔ API — بدون نتیجه یا badge جعلی.  
6. فیچر ناتمام پشت `productFlags` در `/system/capabilities`؛ دکمهٔ مرده نشان داده نمی‌شود.
7. نقش مهمان/ناظر نباید کاشی‌های عملیاتی ببیند؛ deep-link با EmptyHint صادق بسته می‌شود.

## کنسول سامانه و امنیت فضا

- کنسول پلتفرم (`/admin`، alias `/platform`) فقط وقتی `platformAdmin` زنده و نقش `platform_owner` / `platform_support` باشد از حساب، More و command palette کشف می‌شود (`accountNav({ platformAdminLive, platformRole })`).
- عملیات امنیتی فضای کاری: `/w/[slug]/security-ops` — وقتی antifraud یا maker-checker در capabilities زنده باشد (نه لینک مرده).
- صورتحساب سهم‌محور: `/w/[slug]/statements` — بازهٔ دلخواه، سهم قلم‌به‌قلم، قابل‌پرداخت/بستانکار؛ دستور واریز از تنظیمات فضا (`payoutInstructions` + DELETE/clear)؛ مقصد واریز در صورت وجود master key به‌صورت AES-GCM ذخیره می‌شود (`providers.payoutDestinationCrypto`); خروجی CSV/JSON با انقضای ۷ روز؛ اعلان `statement.ready` با rate-limit و audit؛ ABAC `statement.*` / `payout.manage` (`rbac_abac_v3`). راهنمای ارسال: [STATEMENTS-SEND.md](./ops/STATEMENTS-SEND.md). PDF سرور عمداً نیست.
- Providerهای بیرونی: [PROVIDERS-RUNBOOK.md](./ops/PROVIDERS-RUNBOOK.md).
- فهرست خرج: فیلتر `visibility`/`from`/`to` روی API و همگام با URL صفحهٔ expenses.