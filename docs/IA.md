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
9. حداقل دو مدیر مالی برای فضاهای غیرشخصی (پس از bootstrap)

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

- Shell v2: تب‌ها + «بیشتر» روی `/w/[slug]/…`
- مسیرهای classic و `/hub/*` با redirect به `/w` حفظ bookmark می‌مانند
- منوی classic از همان catalog قالب تغذیه می‌شود

## خانه و مسیر canonical

| کار | URL |
|-----|-----|
| فضای کاری (خانه) | `/w/[slug]/space` |
| مالی / خرج‌ها | `/w/[slug]/expenses` (تسویه `/settlements` · صورتحساب `/invoices` · تکرار `/recurring`) |
| مالی سازمان (Wave F) | `/w/[slug]/org-finance` — فقط وقتی flagهای مربوط در capabilities روشن باشد |
| add-on / تأیید | `/addons` · `/approvals` — فقط با `addonAck` / `approvalQueue` |
| دفتر روزانه | از تب‌ها / More همان slug |
| دعوت / اعضا | `/w/[slug]/members` — ساخت دعوت فقط owner/admin |
| پروفایل / تنظیمات | Shell More / settings |

مسیرهای `/hub/…` و classic → redirect به `/w` (حذف قابلیت نیست).

## سفرهای مشتری

### A — گروه دوستان
ورود → `/w/[slug]/space` → ثبت خرج مشترک / add-on → مانده → پیشنهاد ساده‌سازی بدهی → تسویه

### B — شخصی
ورود → فضای personal → منابع و بودجه → گزارش

### C — سازمان
ورود → خانه org → بودجه / تأیید → خرج؛ خرید از More

## قوانین ناوبری UI

1. هر صفحه حداکثر یک CTA رقابتی در viewport اول (اصل سند ۲.۰).  
2. فرم «هزینه مشترک» و «اضافه شخصی / add-on» باید بصری متمایز باشند.  
3. Quick actions: Primary + Secondary (لینک‌های قبلی reachable می‌مانند).  
4. ماژول خرید/اموال فقط وقتی template اجازه دهد.  
5. یافتن و آمار فقط از دادهٔ API — بدون نتیجه یا badge جعلی.  
6. فیچر ناتمام پشت `productFlags` در `/system/capabilities`؛ دکمهٔ مرده نشان داده نمی‌شود.
