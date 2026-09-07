# UI/UX و Design System

وضعیت: جهت بصری تأییدشده

## 1. شخصیت بصری

«رسمی، شیک، لوکس کنترل‌شده و انسانی»

- سطوح تیره عمیق با ته‌رنگ سبز، نه مشکی یا آبی سرد
- متن عاجی برای گرمای بصری
- سبزآبی برای اعتماد و اقدام اصلی
- شامپاینی فقط برای توجه، خرید و جزئیات ممتاز
- مرز یک‌پیکسلی و سایه محدود
- بدون Glassmorphism، Neon، Crypto visual یا نمودار تزئینی

حرکت‌ها آرام‌اند و اطلاعات مالی را پنهان نمی‌کنند. هیچ موفقیت مالی با انیمیشن
جشن یا Bounce نمایش داده نمی‌شود.

## 2. پالت تثبیت‌شده

### Dark — جهت اصلی

| Token | مقدار | کاربرد |
|---|---:|---|
| Background | `#090E0D` | پس‌زمینه اصلی |
| Surface | `#101816` | کارت و Sidebar |
| Surface Raised | `#16211E` | سطح برجسته |
| Text Primary | `#F3F1E9` | متن عاجی |
| Text Secondary | `#9EAAA6` | متن توضیحی |
| Border | `rgba(220,229,225,.11)` | مرز ساختاری |
| Primary | `#57D7C5` | CTA و حالت فعال |
| Primary Deep | `#0F766E` | سطح یا Hover |
| Gold | `#C9AA70` | توجه محدود و ممتاز |
| Success | `#55D68B` | موفقیت |
| Warning | `#E7B85D` | انتظار/هشدار |
| Error | `#ED7C78` | خطا |

### Light

| Token | مقدار |
|---|---:|
| Background | `#F7F9F8` |
| Surface | `#FFFFFF` |
| Surface Subtle | `#F0F4F2` |
| Text Primary | `#14201D` |
| Text Secondary | `#53615D` |
| Border | `#D7DFDC` |
| Primary | `#0F766E` |
| Primary Hover | `#115E59` |
| Gold/Accent | `#B45309` |
| Success | `#15803D` |
| Warning | `#A16207` |
| Error | `#B91C1C` |
| Focus | `#2563EB` |

کنتراست هر ترکیب قبل از استفاده با WCAG 2.2 AA کنترل می‌شود.

## 3. تایپوگرافی

```css
font-family:
  Vazirmatn Variable,
  "Noto Sans Arabic",
  Tahoma,
  Arial,
  sans-serif;
```

- Display: `32/44`, وزن 700
- H1: `24/36`, وزن 700
- H2: `20/32`, وزن 600
- Title: `16/28`, وزن 600
- Body: `15/26`, وزن 400
- Label: `13/22`, وزن 500
- Caption: `12/20`, وزن 400
- Amount: `20/32` یا `28/40`, وزن 700 و tabular numbers

متن بدنه کمتر از ۱۴ پیکسل نمی‌شود.

## 4. هندسه

- واحد پایه: ۴ پیکسل
- فاصله‌ها: 4، 8، 12، 16، 24، 32، 48، 64
- Input/Button: حداقل 48px
- هدف لمسی: حداقل 44×44px
- Radius کوچک: 8px
- کنترل: 10px
- کارت: 12–16px
- Dialog/Bottom Sheet: 20px
- Pill: 999px
- موبایل: شبکه ۴ ستونی و حاشیه 16px
- تبلت: ۸ ستون و حاشیه 24px
- دسکتاپ: ۱۲ ستون، حاشیه 32px، محتوای حداکثر 1440px

## 5. ناوبری

### موبایل

نوار پایین: خانه، کارها، مالی، بیشتر. دکمه `+` یک Action Menu است:

- ثبت خرج
- ثبت نیاز
- درخواست خرید
- ثبت پرداخت

در فرم و جزئیات، CTA اصلی پایین صفحه ثابت می‌شود.

### تبلت

Navigation Rail سمت راست؛ فهرست/جزئیات دوپنله در عرض مناسب.

### دسکتاپ

Sidebar سمت راست با عرض 280px، Toolbar برابر 64px و الگوی List–Detail.

## 6. اجزای لازم

- App Bar، Workspace Switcher، Bottom Nav، Rail و Sidebar
- Button، FAB، Menu و Command Palette
- Amount Field، Date Picker شمسی، Member Picker و Split Editor
- Request Card، Approval Panel، Stepper و Status Chip
- Financial Summary، Account Statement و Settlement Dialog
- Timeline، Audit Event و Attachment Viewer
- Responsive Table، Filter Sheet و Export Progress
- Skeleton، Empty State، Error Summary، Offline Indicator و Undo

هر Component حالت‌های Default، Hover، Pressed، Focus، Disabled، Loading، Error و
Read-only دارد و در Storybook ثبت می‌شود.

## 7. حرکت

- Page entrance: `180–240ms`
- Control transition: `120–160ms`
- Easing: `cubic-bezier(.2,.8,.2,1)`
- Hover: جابه‌جایی حداکثر 2px
- Balance ambient: حرکت تنفسی بسیار ظریف 6–8 ثانیه
- Pending indicator: Pulse آرام
- Timeline: حرکت خط بسیار کند
- پشتیبانی اجباری از `prefers-reduced-motion`
- دکمه توقف Animation در محیط Design Review

## 8. Content Design

واژگان ثابت:

- نیاز: اعلام چیزی که لازم است
- درخواست خرید: نیاز رسمی‌شده برای تأیید
- تأیید: اجازه ادامه، نه خرید قطعی
- خرید: ثبت معامله و مبلغ واقعی
- تحویل: دریافت تمام یا بخشی از اقلام
- تجهیز: دارایی قابل پیگیری
- سهم: بخش هر عضو از خرج
- مانده: نتیجه اسناد
- تسویه: پرداخت برای کاهش مانده

از «ثبت» بدون مفعول، عدد مثبت/منفی مبهم و مبلغ بدون واحد پرهیز می‌شود.

## 9. RTL و دسترس‌پذیری

- `dir="rtl"` در ریشه و `dir="auto"` برای متن ناشناخته
- `<bdi>` برای IBAN، کد و شناسه
- ترتیب DOM مطابق ترتیب خواندن
- کنتراست متن 4.5:1 و UI برابر 3:1
- Focus واضح، Keyboard کامل و Focus restoration
- رنگ تنها نشان‌دهنده وضعیت نیست
- خطا با `aria-invalid` و `aria-describedby`
- نمودار همراه خلاصه متنی
- آیکون جهت‌دار در RTL Mirror می‌شود

## 10. معیار پذیرش UX

- First-click صحیح مسیرهای اصلی ≥ 85٪
- ثبت خرج بازگشتی موفق ≥ 90٪
- زمان میانه ثبت خرج ≤ 60 ثانیه
- تأیید درخواست ≤ 30 ثانیه
- خطای تقسیم سهم < 3٪
- تشخیص درست بدهی ≥ 90٪
- SUS ≥ 80

## 11. قوانین اجرایی (dong-50)

- حداقل هدف لمسی **۴۸×۴۸px** برای کنترل‌های تعاملی سفارشی (علاوه بر `Field` مرکزی).
- خطا روی فیلد: فقط از prop `error` در `TextField`/`SelectField` (`aria-invalid` + `aria-describedby`).
- بارگذاری ≠ خالی: `EmptyHint loading` / `Skeleton` در مقابل `EmptyState` با CTA.
- مودال: فقط `Modal` مشترک (`focus-trap`، Escape، بازگشت فوکوس).
- اعداد پول: `Amount` با `dir="ltr"` روی رقم.
- آیکون جهت‌دار: کلاس `dirIconRtl dirIconRtl--flip`.
- i18n: فعلاً تک‌زبانه فارسی — `docs/I18N.md`.

## 12. بازبینی مسیرهای classic (IA)

هر ۶ ماه مسیرهای redirect کلاسیک (`/workspaces`, `/hub`, …) با analytics واقعی بازبینی می‌شوند؛ بدون دادهٔ استفاده، حذف نمی‌شوند (سیاست additive). متریک هدف: نرخ تکمیل onboarding (قدم ۱→۴) وقتی رویدادنگاری محصول فعال شد.
